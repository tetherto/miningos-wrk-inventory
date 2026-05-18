#!/usr/bin/env node
'use strict'

/*
  Migrates spare-part `info.location` from legacy values to the canonical
  MINER_LOCATIONS enum. For each remapped part, creates a Type-1 "data
  migration" WO so the repair history keeps a trace of the change.

  Backup: snapshot the inventory + WO rack Hyperbee stores before running.
    $ cp -a <inventory>/store <inventory>/store.bak.$(date +%s)

  Usage:
    node scripts/migrate-locations.js --api-url=http://localhost:3000 --token=<bearer> [--dry-run]
*/

const { randomUUID } = require('crypto')
const { parseArgs } = require('util')
const {
  MINER_LOCATIONS,
  LOCATION_MIGRATION_MAP,
  WORK_ORDER_THING_TYPE,
  WORK_ORDER_TYPES,
  WORK_ORDER_VALID_DEVICE_TYPES
} = require('../workers/lib/constants')

const MIGRATION_USER = 'system-migration'
const CANONICAL = new Set(MINER_LOCATIONS)
const WAIT_MS = 5000
const POLL_MS = 100
const WO_FULL_TYPE_SUFFIX = `-${WORK_ORDER_THING_TYPE}`

function _isWorkOrder (t) {
  return typeof t.type === 'string' && t.type.endsWith(WO_FULL_TYPE_SUFFIX)
}

function planMigrations (things) {
  const stats = {}
  const unknown = {}
  const plan = []
  for (const t of things) {
    if (!t || _isWorkOrder(t)) continue
    const fromLoc = t.info?.location
    if (!fromLoc) continue
    if (CANONICAL.has(fromLoc)) continue
    const toLoc = LOCATION_MIGRATION_MAP[fromLoc]
    if (!toLoc) {
      unknown[fromLoc] = (unknown[fromLoc] || 0) + 1
      continue
    }
    const key = `${fromLoc} -> ${toLoc}`
    stats[key] = (stats[key] || 0) + 1
    plan.push({ part: t, fromLoc, toLoc })
  }
  return { plan, stats, unknown }
}

function deriveDeviceType (part) {
  const tags = Array.isArray(part.tags) ? part.tags : []
  const type = typeof part.type === 'string' ? part.type : ''
  for (const dt of WORK_ORDER_VALID_DEVICE_TYPES) {
    if (type === dt || type.endsWith(`-${dt}`)) return dt
    for (const tag of tags) {
      if (tag === dt || tag.endsWith(`-${dt}`)) return dt
    }
  }
  return 'psu'
}

function flatten (orkResults) {
  const out = []
  const seen = new Set()
  if (!Array.isArray(orkResults)) return out
  for (const r of orkResults) {
    if (!r || r.error) continue
    const data = Array.isArray(r) ? r : (r.data || r.result || [])
    if (!Array.isArray(data)) continue
    for (const t of data) {
      if (!t) continue
      const id = t.id || t._id
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      out.push(t)
    }
  }
  return out
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson (url, opts, headers) {
  const res = await fetch(url, { ...opts, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status} ${url} :: ${body.slice(0, 300)}`)
  }
  return res.json()
}

async function resolveWoRack (apiUrl, headers) {
  const racks = await fetchJson(`${apiUrl}/auth/list-racks?type=inventory-${WORK_ORDER_THING_TYPE}`, { method: 'GET' }, headers)
  const flat = flatten(racks)
  if (!flat.length) throw new Error('ERR_NO_WORK_ORDER_RACK_FOUND')
  return flat[0].id
}

async function listAllParts (apiUrl, headers) {
  const results = await fetchJson(`${apiUrl}/auth/list-things?limit=10000`, { method: 'GET' }, headers)
  return flatten(results)
}

async function waitForThing (apiUrl, headers, id) {
  const deadline = Date.now() + WAIT_MS
  const q = encodeURIComponent(JSON.stringify({ id }))
  while (Date.now() <= deadline) {
    const results = await fetchJson(`${apiUrl}/auth/list-things?query=${q}&overwriteCache=true`, { method: 'GET' }, headers)
    const flat = flatten(results)
    if (flat.length) return flat[0]
    await sleep(POLL_MS)
  }
  return null
}

async function pushAction (apiUrl, headers, body) {
  return fetchJson(`${apiUrl}/auth/actions/voting`, {
    method: 'POST',
    body: JSON.stringify(body)
  }, { ...headers, 'content-type': 'application/json' })
}

async function migrateOne (apiUrl, headers, woRackId, partRackMap, entry) {
  const { part, fromLoc, toLoc } = entry
  const partRackId = partRackMap.get(part.id)
  if (!partRackId) throw new Error(`ERR_RACK_NOT_FOUND_FOR_PART:${part.id}`)

  const ts = Date.now()
  const woId = randomUUID()
  const partsMoves = [{
    partId: part.id,
    partCode: part.code,
    fromLocation: fromLoc,
    toLocation: toLoc,
    role: 'migration',
    ts,
    user: MIGRATION_USER
  }]
  const woInfo = {
    type: WORK_ORDER_TYPES.REGISTER,
    deviceType: deriveDeviceType(part),
    deviceModel: part.info?.parentDeviceModel || part.info?.model || 'unknown',
    deviceIdentifier: part.info?.serialNum || part.code || part.id,
    createdBy: MIGRATION_USER,
    createdAt: ts,
    partsMoves
  }

  await pushAction(apiUrl, headers, {
    action: 'registerThing',
    query: { rack: woRackId },
    params: [{ rackId: woRackId, id: woId, info: woInfo }]
  })

  const wo = await waitForThing(apiUrl, headers, woId)
  if (!wo) throw new Error(`ERR_MIGRATION_WO_NOT_VISIBLE:${woId}`)

  await pushAction(apiUrl, headers, {
    action: 'updateThing',
    query: { rack: partRackId },
    params: [{
      rackId: partRackId,
      id: part.id,
      info: { location: toLoc, workOrderId: woId, workOrderCode: wo.code }
    }]
  })

  return { partId: part.id, partCode: part.code, woId, woCode: wo.code, fromLoc, toLoc }
}

async function main () {
  const { values } = parseArgs({
    options: {
      'api-url': { type: 'string', default: 'http://localhost:3000' },
      token: { type: 'string', default: '' },
      'dry-run': { type: 'boolean', default: false }
    }
  })

  const apiUrl = values['api-url'].replace(/\/$/, '')
  const dryRun = values['dry-run']
  const headers = values.token ? { authorization: `Bearer ${values.token}` } : {}

  const all = await listAllParts(apiUrl, headers)
  const parts = all.filter((t) => t && t.type !== WORK_ORDER_THING_TYPE)
  const partRackMap = new Map(parts.map((p) => [p.id, p.rack]))

  const { plan, stats, unknown } = planMigrations(parts)

  console.log('=== Migration Plan ===')
  for (const [k, c] of Object.entries(stats)) console.log(`  ${k}: ${c}`)
  for (const [k, c] of Object.entries(unknown)) console.log(`  UNKNOWN (skipped) "${k}": ${c}`)
  console.log(`Total parts to migrate: ${plan.length}`)

  if (dryRun) {
    console.log('--dry-run: no changes made.')
    return
  }

  if (!plan.length) {
    console.log('Nothing to do.')
    return
  }

  const woRackId = await resolveWoRack(apiUrl, headers)
  const results = []
  for (const entry of plan) {
    try {
      results.push(await migrateOne(apiUrl, headers, woRackId, partRackMap, entry))
    } catch (err) {
      console.error(`  FAILED for part ${entry.part.code || entry.part.id}: ${err.message}`)
    }
  }
  console.log(`Migrated ${results.length}/${plan.length} parts.`)
  for (const r of results) {
    console.log(`  ${r.partCode} (${r.fromLoc} -> ${r.toLoc}) wo=${r.woCode}`)
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.stack || err.message || err)
    process.exit(1)
  })
}

module.exports = { planMigrations, deriveDeviceType, flatten }
