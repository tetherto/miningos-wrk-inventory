'use strict'

const async = require('async')
const Hyperblobs = require('hyperblobs')
const { v4: uuidv4 } = require('uuid')
const WrkInventoryRack = require('./worker-base')
const { validateWarranty } = require('./warranty-schemas')
const {
  WORK_ORDER_THING_TYPE,
  WORK_ORDER_TYPES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TERMINAL_STATUSES,
  WORK_ORDER_VALID_TRANSITIONS,
  WORK_ORDER_DEFAULT_PREFIX,
  WORK_ORDER_FILE_MAX_BYTES_DEFAULT,
  WORK_ORDER_FILE_MIME_ALLOWLIST_DEFAULT,
  FILE_RPC_METHODS,
  FILE_TYPES,
  WORK_ORDER_COUNTERS_DB,
  WORK_ORDER_BLOBS_CORE,
  WORK_ORDER_COUNTER_KEY_PREFIX,
  WORK_ORDER_COUNTER_CAS_MAX_ATTEMPTS,
  WORK_ORDER_VALID_DEVICE_TYPES
} = require('./constants')

const WO_TYPES = new Set(Object.values(WORK_ORDER_TYPES))
const WO_STATUSES = new Set(Object.values(WORK_ORDER_STATUSES))
const WO_VALID_DEVICE_TYPES_SET = new Set(WORK_ORDER_VALID_DEVICE_TYPES)
const counterKey = (type) => `${WORK_ORDER_COUNTER_KEY_PREFIX}${type}`

class WrkWorkOrderRack extends WrkInventoryRack {
  _start (cb) {
    async.series([
      (next) => { super._start(next) },
      async () => {
        this.workOrderPrefix =
          this.conf?.thing?.workOrderPrefix || WORK_ORDER_DEFAULT_PREFIX
        this.workOrderCounters = this.db.sub(WORK_ORDER_COUNTERS_DB)
        this._workOrderCounterCache = new Map()

        const blobCore = this.store_s1.getCore({ name: WORK_ORDER_BLOBS_CORE })

        await Promise.all([
          this.workOrderCounters.ready(),
          blobCore.ready()
        ])
        this.workOrderBlobs = new Hyperblobs(blobCore)

        this.workOrderFileMaxBytes =
          this.conf?.thing?.workOrderFileMaxBytes || WORK_ORDER_FILE_MAX_BYTES_DEFAULT
        this.workOrderFileMimeAllowlist = new Set(
          this.conf?.thing?.workOrderFileMimeAllowlist || WORK_ORDER_FILE_MIME_ALLOWLIST_DEFAULT
        )

        const rpcServer = this.net_r0.rpcServer
        for (const method of FILE_RPC_METHODS) {
          rpcServer.respond(method, async (req) => {
            return await this.net_r0.handleReply(method, req)
          })
        }
      }
    ], cb)
  }

  getThingType () {
    return super.getThingType() + `-${WORK_ORDER_THING_TYPE}`
  }

  getThingTags () {
    return [...super.getThingTags(), WORK_ORDER_THING_TYPE]
  }

  selectThingInfo (thg) {
    return { info: thg.info }
  }

  async _nextWorkOrderNumber (type) {
    if (!this._workOrderCounterCache) this._workOrderCounterCache = new Map()
    const key = counterKey(type)
    let current = this._workOrderCounterCache.get(type)
    if (current === undefined) {
      const node = await this.workOrderCounters.get(key)
      current = node ? parseInt(node.value.toString(), 10) : 0
    }
    for (let attempt = 0; attempt < WORK_ORDER_COUNTER_CAS_MAX_ATTEMPTS; attempt++) {
      const next = current + 1
      let won = true
      await this.workOrderCounters.put(
        key,
        Buffer.from(String(next)),
        {
          cas: (prev) => {
            const prevVal = prev?.value ? parseInt(prev.value.toString(), 10) : 0
            if (prevVal !== current) {
              current = prevVal
              won = false
              return false
            }
            return true
          }
        }
      )
      if (won) {
        this._workOrderCounterCache.set(type, next)
        return next
      }
    }
    throw new Error('ERR_WO_COUNTER_CAS_EXHAUSTED')
  }

  _validateRegisterThing (data) {
    if (!data.info) throw new Error('ERR_THING_VALIDATE_INFO_INVALID')
    if (!WO_TYPES.has(data.info.type)) throw new Error('ERR_WO_TYPE_INVALID')
    if (!data.info.deviceType || !WO_VALID_DEVICE_TYPES_SET.has(data.info.deviceType)) {
      throw new Error('ERR_WO_DEVICE_TYPE_INVALID')
    }
    if (!data.info.deviceModel || typeof data.info.deviceModel !== 'string') {
      throw new Error('ERR_WO_DEVICE_MODEL_INVALID')
    }
    if (!data.info.deviceIdentifier || typeof data.info.deviceIdentifier !== 'string') {
      throw new Error('ERR_WO_DEVICE_IDENTIFIER_INVALID')
    }
    if (data.info.type === WORK_ORDER_TYPES.REGULAR) {
      if (!data.info.issue || typeof data.info.issue !== 'string') {
        throw new Error('ERR_WO_ISSUE_INVALID')
      }
    }
    data.info.status = data.info.status || WORK_ORDER_STATUSES.OPEN
    data.info.assignedTo = data.info.assignedTo ?? null
    data.info.finalResult = data.info.finalResult ?? null
    data.info.warranty = data.info.warranty ?? null
    if (!Array.isArray(data.info.partsMoves)) data.info.partsMoves = []
    validateWarranty(data.info.warranty)
  }

  _validateUpdateThing (data) {
    const current = this.mem.things[data.id]
    if (!current) throw new Error('ERR_THING_NOTFOUND')

    const currentStatus = current.info?.status
    const nextStatus = data.info?.status

    if (WORK_ORDER_TERMINAL_STATUSES.has(currentStatus)) {
      throw new Error('ERR_WO_INVALID_STATUS_TRANSITION')
    }

    if (nextStatus && nextStatus !== currentStatus) {
      if (!WO_STATUSES.has(nextStatus)) {
        throw new Error('ERR_WO_INVALID_STATUS_TRANSITION')
      }
      const allowed = WORK_ORDER_VALID_TRANSITIONS[currentStatus]
      if (!allowed || !allowed.has(nextStatus)) {
        throw new Error('ERR_WO_INVALID_STATUS_TRANSITION')
      }
    }

    if (data.info?.warranty !== undefined) {
      validateWarranty(data.info.warranty)
    }
  }

  async registerThing (req) {
    if (!req.code && req.info?.type) {
      const n = await this._nextWorkOrderNumber(req.info.type)
      req.code = `${this.workOrderPrefix}-${req.info.type}-${String(n).padStart(4, '0')}`
    }
    await super.registerThing(req)
    return this.mem.things[req.id] || null
  }

  async updateThing (req) {
    await super.updateThing(req)
    return this.mem.things[req.id] || null
  }

  _assertFileType (req) {
    if (req.type !== FILE_TYPES.WORK_ORDER) throw new Error('ERR_FILE_TYPE_INVALID')
  }

  async storeFile (req) {
    this._assertFileType(req)
    if (!req.workOrderId) throw new Error('ERR_WO_FILE_WORK_ORDER_ID_REQUIRED')
    if (!req.contentBase64 || typeof req.contentBase64 !== 'string') {
      throw new Error('ERR_WO_FILE_CONTENT_REQUIRED')
    }
    if (!req.mime || !this.workOrderFileMimeAllowlist.has(req.mime)) {
      throw new Error('ERR_FILE_MIME_NOT_ALLOWED')
    }
    if (req.contentBase64.length * 0.75 > this.workOrderFileMaxBytes) {
      throw new Error('ERR_FILE_TOO_LARGE')
    }
    const buf = Buffer.from(req.contentBase64, 'base64')
    if (buf.length > this.workOrderFileMaxBytes) {
      throw new Error('ERR_FILE_TOO_LARGE')
    }
    const blobRef = await this.workOrderBlobs.put(buf)
    return {
      id: uuidv4(),
      name: req.name || 'unnamed',
      mime: req.mime,
      size: buf.length,
      blobRef,
      ts: Date.now(),
      user: req.user || null
    }
  }

  async loadFile (req) {
    this._assertFileType(req)
    if (!req.blobRef) throw new Error('ERR_WO_FILE_BLOB_REF_REQUIRED')
    const buf = await this.workOrderBlobs.get(req.blobRef)
    if (!buf) throw new Error('ERR_WO_FILE_NOT_FOUND')
    return { contentBase64: buf.toString('base64') }
  }

  async removeFile (req) {
    this._assertFileType(req)
    if (!req.blobRef) throw new Error('ERR_WO_FILE_BLOB_REF_REQUIRED')
    try {
      await this.workOrderBlobs.clear(req.blobRef)
    } catch (e) {
      console.error('[wo-rack] removeFile blob clear failed', { blobRef: req.blobRef, err: e?.message })
    }
    return 1
  }
}

module.exports = WrkWorkOrderRack
