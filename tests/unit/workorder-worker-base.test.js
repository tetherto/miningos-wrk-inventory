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

const WO_FILE = { type: 'work_order' }

function newFileRack ({ slave = false, blobs } = {}) {
  const r = Object.create(WrkWorkOrderRack.prototype)
  r.mem = { things: {} }
  r.ctx = { slave }
  r.workOrderFileMaxBytes = 10 * 1024 * 1024
  r.workOrderFileMimeAllowlist = new Set(['text/plain'])
  r.workOrderBlobs = blobs || {
    put: async () => ({ blockOffset: 0, byteOffset: 0, blockLength: 1, byteLength: 4 }),
    get: async () => Buffer.from('data'),
    clear: async () => {}
  }
  r.debugError = () => {}
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
  const entry = { partId: 'p1', fromLocation: null, toLocation: 'Site Warehouse' }
  const valid = { info: { type: 1, deviceType: 'psu', deviceModel: 'PSU-1', deviceIdentifier: 'SN-1', partsMoves: [entry] } }
  r._validateRegisterThing(valid)
  t.is(valid.info.partsMoves.length, 1)
  t.is(valid.info.partsMoves[0].partId, 'p1')
})

test('wo-spike: _validateRegisterThing rejects invalid warranty payload', (t) => {
  const r = newRack()
  const base = { type: 1, deviceType: 'psu', deviceModel: 'PSU-1', deviceIdentifier: 'SN-1' }
  t.exception(
    () => r._validateRegisterThing({ info: { ...base, warranty: { vendor: 'unknown', fields: {} } } }),
    /ERR_UNKNOWN_VENDOR/
  )
  t.exception(
    () => r._validateRegisterThing({ info: { ...base, warranty: { vendor: 'microbt', fields: {} } } }),
    /ERR_WARRANTY_MISSING_FIELDS/
  )
  const valid = { info: { ...base, warranty: { vendor: 'microbt', fields: { rmaNumber: 'RMA-1', faultCode: 'E03' } } } }
  r._validateRegisterThing(valid)
  t.is(valid.info.warranty.vendor, 'microbt')
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

test('wo-spike: _validateUpdateThing validates warranty when provided', (t) => {
  const r = newRack()
  r.mem.things = { 'wo-1': { id: 'wo-1', info: { status: WORK_ORDER_STATUSES.OPEN } } }
  t.exception(
    () => r._validateUpdateThing({ id: 'wo-1', info: { warranty: { vendor: 'unknown', fields: {} } } }),
    /ERR_UNKNOWN_VENDOR/
  )
  t.exception(
    () => r._validateUpdateThing({ id: 'wo-1', info: { warranty: { vendor: 'microbt', fields: {} } } }),
    /ERR_WARRANTY_MISSING_FIELDS/
  )
  // valid warranty does not throw
  r._validateUpdateThing({ id: 'wo-1', info: { warranty: { vendor: 'microbt', fields: { rmaNumber: 'X', faultCode: 'Y' } } } })
  // clearing warranty to null is allowed
  r._validateUpdateThing({ id: 'wo-1', info: { warranty: null } })
})

test('wo-file: every file method rejects a non-work_order type', async (t) => {
  const r = newFileRack()
  await t.exception(() => r.storeFile({ type: 'other' }), /ERR_FILE_TYPE_INVALID/)
  await t.exception(() => r.loadFile({ type: 'other' }), /ERR_FILE_TYPE_INVALID/)
  await t.exception(() => r.removeFile({ type: 'other' }), /ERR_FILE_TYPE_INVALID/)
})

test('wo-file: storeFile / removeFile are blocked on a slave node', async (t) => {
  const r = newFileRack({ slave: true })
  await t.exception(() => r.storeFile({ ...WO_FILE, workOrderId: 'wo-1' }), /ERR_SLAVE_BLOCK/)
  await t.exception(() => r.removeFile({ ...WO_FILE, workOrderId: 'wo-1', fileId: 'f-1' }), /ERR_SLAVE_BLOCK/)
})

test('wo-file: storeFile requires the work order to exist', async (t) => {
  const r = newFileRack()
  await t.exception(
    () => r.storeFile({ ...WO_FILE, workOrderId: 'missing', mime: 'text/plain', contentBase64: Buffer.from('hi').toString('base64') }),
    /ERR_WO_FILE_WORK_ORDER_NOT_FOUND/
  )
})

test('wo-file: storeFile stores a blob once the work order exists', async (t) => {
  const r = newFileRack()
  r.mem.things = { 'wo-1': { id: 'wo-1', info: {} } }
  const meta = await r.storeFile({
    ...WO_FILE,
    workOrderId: 'wo-1',
    name: 'n.txt',
    mime: 'text/plain',
    user: 'u',
    contentBase64: Buffer.from('hi').toString('base64')
  })
  t.is(meta.mime, 'text/plain')
  t.ok(meta.blobRef, 'returns a blob descriptor')
})

test('wo-file: loadFile / removeFile resolve the blob from the WO record by fileId', async (t) => {
  const blobRef = { blockOffset: 1, byteOffset: 2, blockLength: 1, byteLength: 4 }
  const r = newFileRack()
  r.mem.things = { 'wo-1': { id: 'wo-1', info: { files: [{ id: 'f-1', blobRef }] } } }

  const loaded = await r.loadFile({ ...WO_FILE, workOrderId: 'wo-1', fileId: 'f-1' })
  t.is(loaded.contentBase64, Buffer.from('data').toString('base64'))

  const out = await r.removeFile({ ...WO_FILE, workOrderId: 'wo-1', fileId: 'f-1' })
  t.alike(out, { cleared: true })
})

test('wo-file: loadFile / removeFile reject a fileId not on the named work order', async (t) => {
  const r = newFileRack()
  r.mem.things = { 'wo-1': { id: 'wo-1', info: { files: [{ id: 'f-1', blobRef: {} }] } } }
  await t.exception(() => r.loadFile({ ...WO_FILE, workOrderId: 'wo-1', fileId: 'f-x' }), /ERR_WO_FILE_NOT_FOUND/)
  await t.exception(() => r.removeFile({ ...WO_FILE, workOrderId: 'wo-2', fileId: 'f-1' }), /ERR_WO_FILE_WORK_ORDER_NOT_FOUND/)
})

test('wo-file: removeFile reports cleared:false when the blob clear throws', async (t) => {
  let logged = false
  const r = newFileRack({
    blobs: { put: async () => ({}), get: async () => Buffer.alloc(0), clear: async () => { throw new Error('boom') } }
  })
  r.debugError = () => { logged = true }
  r.mem.things = { 'wo-1': { id: 'wo-1', info: { files: [{ id: 'f-1', blobRef: {} }] } } }
  const out = await r.removeFile({ ...WO_FILE, workOrderId: 'wo-1', fileId: 'f-1' })
  t.alike(out, { cleared: false }, 'caller can tell the blob clear failed')
  t.ok(logged, 'failure is logged via debugError')
})

test('wo-spike: getThingType / getThingTags identify WOs', (t) => {
  const parent = Object.getPrototypeOf(WrkWorkOrderRack.prototype)
  const originalType = parent.getThingType
  const originalTags = parent.getThingTags
  parent.getThingType = function () { return 'inventory' }
  parent.getThingTags = function () { return ['inventory'] }
  try {
    const r = Object.create(WrkWorkOrderRack.prototype)
    t.is(r.getThingType(), 'inventory-work_order')
    t.ok(r.getThingTags().includes('work_order'))
  } finally {
    parent.getThingType = originalType
    parent.getThingTags = originalTags
  }
})
