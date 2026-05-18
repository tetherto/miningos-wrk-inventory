'use strict'

const test = require('brittle')
const WrkWorkOrderRack = require('../../workers/lib/workorder-worker-base')
const { WORK_ORDER_STATUSES } = require('../../workers/lib/constants')

class MockBee {
  constructor () {
    this.data = new Map()
    this._writeChain = Promise.resolve()
  }

  async ready () {}

  async get (key) {
    if (!this.data.has(key)) return null
    return { value: Buffer.from(this.data.get(key)) }
  }

  async put (key, value, opts = {}) {
    const work = async () => {
      if (opts.cas) {
        const prev = this.data.has(key)
          ? { value: Buffer.from(this.data.get(key)) }
          : null
        const allow = await opts.cas(prev, { key, value })
        if (!allow) return
      }
      this.data.set(key, Buffer.isBuffer(value) ? value.toString() : String(value))
    }
    const next = this._writeChain.then(work, work)
    this._writeChain = next.catch(() => {})
    return next
  }
}

function newRack () {
  const r = Object.create(WrkWorkOrderRack.prototype)
  r.mem = { things: {} }
  r.workOrderPrefix = 'IVI'
  r.workOrderCounters = new MockBee()
  return r
}

test('wo-spike: _nextWorkOrderNumber increments per type with CAS', async (t) => {
  const r = newRack()
  const a = await r._nextWorkOrderNumber(2)
  const b = await r._nextWorkOrderNumber(2)
  const c = await r._nextWorkOrderNumber(1)
  t.is(a, 1)
  t.is(b, 2)
  t.is(c, 1)
})

test('wo-spike: 10 concurrent _nextWorkOrderNumber calls are collision-free', async (t) => {
  const r = newRack()
  const nums = await Promise.all(
    Array.from({ length: 10 }, () => r._nextWorkOrderNumber(2))
  )
  t.is(new Set(nums).size, 10)
})

test('wo-spike: _validateRegisterThing rejects bad type / missing fields and fills defaults', (t) => {
  const r = newRack()
  t.exception(() => r._validateRegisterThing({}), /ERR_THING_VALIDATE_INFO_INVALID/)
  t.exception(() => r._validateRegisterThing({ info: { type: 99 } }), /ERR_WO_TYPE_INVALID/)
  t.exception(() => r._validateRegisterThing({ info: { type: 2, deviceType: 'cooling', deviceModel: 'm', deviceIdentifier: 'd' } }), /ERR_WO_DEVICE_TYPE_INVALID/)
  t.exception(() => r._validateRegisterThing({ info: { type: 2, deviceType: 'miner', deviceModel: 'm', deviceIdentifier: 'd' } }), /ERR_WO_ISSUE_INVALID/)

  const valid = { info: { type: 2, deviceType: 'miner', deviceModel: 'm', deviceIdentifier: 'd', issue: 'i' } }
  r._validateRegisterThing(valid)
  t.is(valid.info.status, WORK_ORDER_STATUSES.OPEN)
  t.is(valid.info.assignedTo, null)
  t.is(valid.info.finalResult, null)
  t.alike(valid.info.partsMoves, [])
})

test('wo-spike: _validateRegisterThing — Type 1 does not require issue', (t) => {
  const r = newRack()
  const valid = { info: { type: 1, deviceType: 'psu', deviceModel: 'PSU-1', deviceIdentifier: 'SN-1' } }
  r._validateRegisterThing(valid)
  t.is(valid.info.status, WORK_ORDER_STATUSES.OPEN)
  t.alike(valid.info.partsMoves, [])
})

test('wo-spike: _validateRegisterThing — Type 1 preserves caller-supplied partsMoves', (t) => {
  const r = newRack()
  const entry = { partId: 'p1', fromLocation: null, toLocation: 'SiteWarehouse' }
  const valid = { info: { type: 1, deviceType: 'psu', deviceModel: 'PSU-1', deviceIdentifier: 'SN-1', partsMoves: [entry] } }
  r._validateRegisterThing(valid)
  t.is(valid.info.partsMoves.length, 1)
  t.is(valid.info.partsMoves[0].partId, 'p1')
})

test('wo-spike: _validateUpdateThing enforces transitions and terminal-state guard', (t) => {
  const r = newRack()
  r.mem.things = {
    open: { id: 'open', info: { status: WORK_ORDER_STATUSES.OPEN } },
    closed: { id: 'closed', info: { status: WORK_ORDER_STATUSES.CLOSED } },
    cancelled: { id: 'cancelled', info: { status: WORK_ORDER_STATUSES.CANCELLED } }
  }

  // open → closed: ok
  r._validateUpdateThing({ id: 'open', info: { status: WORK_ORDER_STATUSES.CLOSED } })
  // open → in_progress: ok
  r._validateUpdateThing({ id: 'open', info: { status: WORK_ORDER_STATUSES.IN_PROGRESS } })
  // open → 'bogus': bad
  t.exception(() => r._validateUpdateThing({ id: 'open', info: { status: 'bogus' } }), /ERR_WO_INVALID_STATUS_TRANSITION/)

  // closed → anything: invalid transition
  t.exception(() => r._validateUpdateThing({ id: 'closed', info: { issue: 'x' } }), /ERR_WO_INVALID_STATUS_TRANSITION/)
  t.exception(() => r._validateUpdateThing({ id: 'closed', info: { status: WORK_ORDER_STATUSES.OPEN } }), /ERR_WO_INVALID_STATUS_TRANSITION/)

  // cancelled → anything: invalid transition
  t.exception(() => r._validateUpdateThing({ id: 'cancelled', info: { status: WORK_ORDER_STATUSES.CLOSED } }), /ERR_WO_INVALID_STATUS_TRANSITION/)

  // unknown id
  t.exception(() => r._validateUpdateThing({ id: 'nope', info: {} }), /ERR_THING_NOTFOUND/)
})

test('wo-spike: getThingType / getThingTags identify WOs', (t) => {
  const r = Object.create(WrkWorkOrderRack.prototype)
  Object.getPrototypeOf(WrkWorkOrderRack.prototype).getThingType = function () { return 'inventory' }
  Object.getPrototypeOf(WrkWorkOrderRack.prototype).getThingTags = function () { return ['inventory'] }
  t.is(r.getThingType(), 'inventory-work_order')
  t.ok(r.getThingTags().includes('work_order'))
})
