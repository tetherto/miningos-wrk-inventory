'use strict'

const async = require('async')
const WrkInventoryRack = require('./worker-base')
const {
  WORK_ORDER_THING_TYPE,
  WORK_ORDER_TYPES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TERMINAL_STATUSES,
  WORK_ORDER_VALID_TRANSITIONS,
  WORK_ORDER_DEFAULT_PREFIX
} = require('./constants')

const WO_TYPES = new Set(Object.values(WORK_ORDER_TYPES))
const WO_STATUSES = new Set(Object.values(WORK_ORDER_STATUSES))
const COUNTER_KEY = (type) => `wo:counter:${type}`

class WrkWorkOrderRack extends WrkInventoryRack {
  _start (cb) {
    async.series([
      (next) => { super._start(next) },
      async () => {
        this.workOrderPrefix =
          this.conf?.thing?.workOrderPrefix || WORK_ORDER_DEFAULT_PREFIX
        this.workOrderCounters = this.db.sub('wo_counters')
        await this.workOrderCounters.ready()
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

  async collectThingSnap () { return null }

  async _nextWorkOrderNumber (type) {
    while (true) {
      const node = await this.workOrderCounters.get(COUNTER_KEY(type))
      const current = node ? parseInt(node.value.toString(), 10) : 0
      const next = current + 1
      let succeeded = true
      await this.workOrderCounters.put(
        COUNTER_KEY(type),
        Buffer.from(String(next)),
        {
          cas: (prev) => {
            const prevVal = prev?.value ? parseInt(prev.value.toString(), 10) : 0
            const ok = prevVal === current
            if (!ok) succeeded = false
            return ok
          }
        }
      )
      if (succeeded) return next
    }
  }

  _validateRegisterThing (data) {
    if (!data.info) throw new Error('ERR_THING_VALIDATE_INFO_INVALID')
    if (!WO_TYPES.has(data.info.type)) throw new Error('ERR_WO_TYPE_INVALID')
    if (!data.info.deviceType || typeof data.info.deviceType !== 'string') {
      throw new Error('ERR_WO_DEVICE_TYPE_INVALID')
    }
    if (!data.info.deviceModel || typeof data.info.deviceModel !== 'string') {
      throw new Error('ERR_WO_DEVICE_MODEL_INVALID')
    }
    if (!data.info.deviceIdentifier || typeof data.info.deviceIdentifier !== 'string') {
      throw new Error('ERR_WO_DEVICE_IDENTIFIER_INVALID')
    }
    if (!data.info.issue || typeof data.info.issue !== 'string') {
      throw new Error('ERR_WO_ISSUE_INVALID')
    }
    data.info.status = data.info.status || WORK_ORDER_STATUSES.OPEN
    data.info.assignedTo = data.info.assignedTo ?? null
    data.info.finalResult = data.info.finalResult ?? null
    data.info.warranty = data.info.warranty ?? null
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
  }

  async registerThing (req) {
    this._validateRegisterThing(req)
    if (!req.code) {
      const n = await this._nextWorkOrderNumber(req.info.type)
      req.code = `${this.workOrderPrefix}-${req.info.type}-${String(n).padStart(4, '0')}`
    }
    await super.registerThing(req)
    const id = req.id || this._findIdByCode(req.code)
    return id ? this.mem.things[id] : null
  }

  async updateThing (req) {
    await super.updateThing(req)
    return this.mem.things[req.id] || null
  }

  _findIdByCode (code) {
    for (const [id, thg] of Object.entries(this.mem.things)) {
      if (thg.code === code) return id
    }
    return null
  }
}

module.exports = WrkWorkOrderRack
