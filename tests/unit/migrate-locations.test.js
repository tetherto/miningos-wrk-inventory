'use strict'

const test = require('brittle')
const { planMigrations, deriveDeviceType, flatten } = require('../../scripts/migrate-locations')

const THINGS = [
  { id: 'p1', code: 'PS-01', type: 'inventory-miner_part-psu', info: { location: 'Workshop Warehouse' } },
  { id: 'p2', code: 'PS-02', type: 'inventory-miner_part-psu', info: { location: 'Workshop Lab' } },
  { id: 'p3', code: 'PS-03', type: 'inventory-miner_part-psu', info: { location: 'Site Lab' } },
  { id: 'p4', code: 'PS-04', type: 'inventory-miner_part-psu', info: { location: 'Mystery Place' } },
  { id: 'p5', code: 'PS-05', type: 'inventory-miner_part-psu', info: {} },
  { id: 'wo1', code: 'IVI-1-0001', type: 'inventory-work_order', info: { location: 'Workshop Warehouse' } }
]

test('planMigrations: groups by from->to and counts', (t) => {
  const { plan, stats } = planMigrations(THINGS)
  t.is(plan.length, 2, 'only p1 and p2 are mapped')
  t.is(stats['Workshop Warehouse -> Site Warehouse'], 1)
  t.is(stats['Workshop Lab -> Site Lab'], 1)
})

test('planMigrations: skips canonical locations + missing location + WO things', (t) => {
  const { plan } = planMigrations(THINGS)
  const ids = plan.map((e) => e.part.id)
  t.absent(ids.includes('p3'), 'canonical skipped')
  t.absent(ids.includes('p5'), 'missing location skipped')
  t.absent(ids.includes('wo1'), 'WO things skipped')
})

test('planMigrations: reports unknown locations separately', (t) => {
  const { plan, unknown } = planMigrations(THINGS)
  t.absent(plan.map((e) => e.part.id).includes('p4'), 'unknown not in migration plan')
  t.is(unknown['Mystery Place'], 1, 'unknown counted as such')
})

test('planMigrations: idempotent — running on already-migrated parts yields empty plan', (t) => {
  const migrated = THINGS.map((t) => ({
    ...t,
    info: { ...t.info, location: t.info.location === 'Workshop Warehouse' ? 'Site Warehouse' : t.info.location === 'Workshop Lab' ? 'Site Lab' : t.info.location }
  }))
  const { plan } = planMigrations(migrated)
  const remaining = plan.filter((e) => e.part.id !== 'p4')
  t.is(remaining.length, 0, 'nothing left to migrate')
})

test('deriveDeviceType: pulls from tags first, then type fallback, defaults to psu', (t) => {
  t.is(deriveDeviceType({ tags: ['inventory', 'miner_part', 'psu'], type: 'inventory-miner_part-psu' }), 'psu')
  t.is(deriveDeviceType({ tags: ['t-inventory-miner_part-hashboard'] }), 'hashboard')
  t.is(deriveDeviceType({ tags: [], type: 'inventory-miner_part-controller' }), 'controller')
  t.is(deriveDeviceType({}), 'psu', 'default')
})

test('flatten: dedups by id across ork results', (t) => {
  const orkA = [{ id: 'a', code: 'A' }, { id: 'b', code: 'B' }]
  const orkB = [{ id: 'b', code: 'B' }, { id: 'c', code: 'C' }]
  const out = flatten([orkA, orkB])
  t.is(out.length, 3)
  t.alike(out.map((x) => x.id), ['a', 'b', 'c'])
})

test('flatten: tolerates {data}/{result} wrapper shapes and skips errors', (t) => {
  const results = [
    { data: [{ id: 'a' }] },
    { result: [{ id: 'b' }] },
    { error: 'nope' },
    null
  ]
  const out = flatten(results)
  t.is(out.length, 2)
  t.alike(out.map((x) => x.id), ['a', 'b'])
})
