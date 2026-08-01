'use strict'

const test = require('brittle')
const WrkWorkOrderRack = require('../../workers/lib/workorder-worker-base')
const WrkInventoryRack = require('../../workers/lib/worker-base')
const {
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
  WORK_ORDER_DEFAULT_PREFIX,
  WORK_ORDER_FILE_MAX_BYTES_DEFAULT,
  WORK_ORDER_FILE_MIME_ALLOWLIST_DEFAULT,
  FILE_RPC_METHODS
} = require('../../workers/lib/constants')

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

test('wo-start: _start wires counters, blobs, default file limits and RPC handlers', async (t) => {
  const parent = WrkInventoryRack.prototype
  const original = parent._start
  parent._start = function (cb) { cb() }

  const respondCalls = []
  const handleReplyCalls = []

  try {
    const r = Object.create(WrkWorkOrderRack.prototype)
    r.conf = { thing: {} }
    r.db = { sub: () => new MockBee() }
    r.store_s1 = { getCore: () => ({ ready: async () => {} }) }
    r.net_r0 = {
      rpcServer: { respond: (method, handler) => respondCalls.push([method, handler]) },
      handleReply: async (method, req) => { handleReplyCalls.push([method, req]); return { ok: true } }
    }

    const err = await new Promise((resolve) => r._start(resolve))
    t.absent(err, '_start completes without error')

    t.is(r.workOrderPrefix, WORK_ORDER_DEFAULT_PREFIX)
    t.ok(r.workOrderCounters, 'workOrderCounters is set')
    t.ok(r.workOrderBlobs, 'workOrderBlobs is set')
    t.is(r.workOrderFileMaxBytes, WORK_ORDER_FILE_MAX_BYTES_DEFAULT)
    t.alike([...r.workOrderFileMimeAllowlist], WORK_ORDER_FILE_MIME_ALLOWLIST_DEFAULT)

    t.is(respondCalls.length, FILE_RPC_METHODS.length)
    t.alike(respondCalls.map(([method]) => method), FILE_RPC_METHODS)

    const [method, handler] = respondCalls[0]
    const result = await handler({ some: 'req' })
    t.alike(result, { ok: true }, 'handler delegates to net_r0.handleReply')
    t.alike(handleReplyCalls[0], [method, { some: 'req' }])
  } finally {
    parent._start = original
  }
})

test('wo-start: _start honors caller-supplied prefix and file limits from conf', async (t) => {
  const parent = WrkInventoryRack.prototype
  const original = parent._start
  parent._start = function (cb) { cb() }

  try {
    const r = Object.create(WrkWorkOrderRack.prototype)
    r.conf = {
      thing: {
        workOrderPrefix: 'CUSTOM',
        workOrderFileMaxBytes: 123,
        workOrderFileMimeAllowlist: ['application/x-custom']
      }
    }
    r.db = { sub: () => new MockBee() }
    r.store_s1 = { getCore: () => ({ ready: async () => {} }) }
    r.net_r0 = {
      rpcServer: { respond: () => {} },
      handleReply: async () => {}
    }

    await new Promise((resolve) => r._start(resolve))

    t.is(r.workOrderPrefix, 'CUSTOM')
    t.is(r.workOrderFileMaxBytes, 123)
    t.alike([...r.workOrderFileMimeAllowlist], ['application/x-custom'])
  } finally {
    parent._start = original
  }
})

test('wo-spike: selectThingInfo returns only the info payload', (t) => {
  const r = newRack()
  const thing = { id: 'wo-1', info: { type: 1 }, extra: 'ignored' }
  t.alike(r.selectThingInfo(thing), { info: thing.info })
})

test('wo-spike: _validateRegisterThing rejects bad type / missing fields and fills defaults', (t) => {
  const r = newRack()
  t.exception(() => r._validateRegisterThing({}), /ERR_THING_VALIDATE_INFO_INVALID/)
  t.exception(() => r._validateRegisterThing({ info: { type: 99 } }), /ERR_WO_TYPE_INVALID/)
  t.exception(() => r._validateRegisterThing({ info: { type: 2, deviceType: 'cooling', deviceModel: 'm', deviceIdentifier: 'd' } }), /ERR_WO_DEVICE_TYPE_INVALID/)
  t.exception(() => r._validateRegisterThing({ info: { type: 3, deviceType: 'miner', deviceModel: 'm', deviceIdentifier: 'd' } }), /ERR_WO_ISSUE_INVALID/)

  const valid = { info: { type: 3, deviceType: 'miner', deviceModel: 'm', deviceIdentifier: 'd', issue: 'i' } }
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
  t.is(valid.info.status, WORK_ORDER_STATUSES.CLOSED)
  t.ok(valid.info.closedAt, 'register WO auto-closes on creation')
  t.alike(valid.info.partsMoves, [])
})

test('wo-spike: _validateRegisterThing — Type 1 preserves caller-supplied partsMoves', (t) => {
  const r = newRack()
  const entry = { partId: 'p1', fromLocation: null, toLocation: 'site.warehouse' }
  const valid = { info: { type: 1, deviceType: 'psu', deviceModel: 'PSU-1', deviceIdentifier: 'SN-1', partsMoves: [entry] } }
  r._validateRegisterThing(valid)
  t.is(valid.info.partsMoves.length, 1)
  t.is(valid.info.partsMoves[0].partId, 'p1')
})

test('wo-spike: _validateRegisterThing preserves caller-supplied remarks', (t) => {
  const r = newRack()
  const valid = { info: { type: 1, deviceType: 'psu', deviceModel: 'PSU-1', deviceIdentifier: 'SN-1', remarks: 'handle with care' } }
  r._validateRegisterThing(valid)
  t.is(valid.info.remarks, 'handle with care')
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

test('wo-spike: _validateRegisterThing rejects missing deviceModel / deviceIdentifier', (t) => {
  const r = newRack()
  t.exception(
    () => r._validateRegisterThing({ info: { type: WORK_ORDER_TYPES.MOVE, deviceType: 'miner', deviceIdentifier: 'd' } }),
    /ERR_WO_DEVICE_MODEL_INVALID/
  )
  t.exception(
    () => r._validateRegisterThing({ info: { type: WORK_ORDER_TYPES.MOVE, deviceType: 'miner', deviceModel: 'm' } }),
    /ERR_WO_DEVICE_IDENTIFIER_INVALID/
  )
})

test('wo-spike: _validateRegisterThing requires issue for MICROBT_NON_MINER too', (t) => {
  const r = newRack()
  const base = { type: WORK_ORDER_TYPES.MICROBT_NON_MINER, deviceType: 'psu', deviceModel: 'm', deviceIdentifier: 'd' }
  t.exception(() => r._validateRegisterThing({ info: { ...base } }), /ERR_WO_ISSUE_INVALID/)

  const valid = { info: { ...base, issue: 'broken' } }
  r._validateRegisterThing(valid)
  t.is(valid.info.status, WORK_ORDER_STATUSES.OPEN)
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

  // closed → open: ok (reopen)
  r._validateUpdateThing({ id: 'closed', info: { status: WORK_ORDER_STATUSES.OPEN } })
  // closed → non-status edit: still frozen
  t.exception(() => r._validateUpdateThing({ id: 'closed', info: { issue: 'x' } }), /ERR_WO_INVALID_STATUS_TRANSITION/)
  // closed → cancelled: only reopen (→ open) leaves the closed state
  t.exception(() => r._validateUpdateThing({ id: 'closed', info: { status: WORK_ORDER_STATUSES.CANCELLED } }), /ERR_WO_INVALID_STATUS_TRANSITION/)

  // cancelled → anything: still terminal (cancellation is not reopenable)
  t.exception(() => r._validateUpdateThing({ id: 'cancelled', info: { status: WORK_ORDER_STATUSES.CLOSED } }), /ERR_WO_INVALID_STATUS_TRANSITION/)
  t.exception(() => r._validateUpdateThing({ id: 'cancelled', info: { status: WORK_ORDER_STATUSES.OPEN } }), /ERR_WO_INVALID_STATUS_TRANSITION/)

  // unknown id
  t.exception(() => r._validateUpdateThing({ id: 'nope', info: {} }), /ERR_THING_NOTFOUND/)
})

test('wo-spike: _validateUpdateThing rejects a disallowed non-terminal transition (in_progress -> open)', (t) => {
  const r = newRack()
  r.mem.things = { wip: { id: 'wip', info: { status: WORK_ORDER_STATUSES.IN_PROGRESS } } }
  t.exception(
    () => r._validateUpdateThing({ id: 'wip', info: { status: WORK_ORDER_STATUSES.OPEN } }),
    /ERR_WO_INVALID_STATUS_TRANSITION/
  )
})

test('wo-spike: _validateUpdateThing keeps auto-closed REGISTER/MOVE WOs editable', (t) => {
  const r = newRack()
  r.mem.things = {
    reg: { id: 'reg', info: { status: WORK_ORDER_STATUSES.CLOSED, type: WORK_ORDER_TYPES.REGISTER } },
    mov: { id: 'mov', info: { status: WORK_ORDER_STATUSES.CLOSED, type: WORK_ORDER_TYPES.MOVE } },
    micro: { id: 'micro', info: { status: WORK_ORDER_STATUSES.CLOSED, type: WORK_ORDER_TYPES.MICROBT_MINER } }
  }
  r._validateUpdateThing({ id: 'reg', info: { assignedTo: 'u1' } })
  r._validateUpdateThing({ id: 'mov', info: { deviceModel: 'X' } })
  t.pass('register/move editable after auto-close')
  t.exception(() => r._validateUpdateThing({ id: 'micro', info: { issue: 'x' } }), /ERR_WO_INVALID_STATUS_TRANSITION/)
})

test('wo-spike: _validateUpdateThing allows reopening a closed WO of any type (closed → open)', (t) => {
  const r = newRack()
  r.mem.things = {
    micro: { id: 'micro', info: { status: WORK_ORDER_STATUSES.CLOSED, type: WORK_ORDER_TYPES.MICROBT_MINER } },
    mov: { id: 'mov', info: { status: WORK_ORDER_STATUSES.CLOSED, type: WORK_ORDER_TYPES.MOVE } }
  }
  // reopen leaves the closed state even for non-editable terminal types
  r._validateUpdateThing({ id: 'micro', info: { status: WORK_ORDER_STATUSES.OPEN } })
  r._validateUpdateThing({ id: 'mov', info: { status: WORK_ORDER_STATUSES.OPEN } })
  t.pass('closed WOs can be reopened regardless of type')
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

test('wo-spike: registerThing auto-generates a code from prefix, type and counter', async (t) => {
  const parent = Object.getPrototypeOf(WrkWorkOrderRack.prototype)
  const original = parent.registerThing
  let receivedReq = null
  parent.registerThing = async function (req) {
    receivedReq = req
    this.mem.things[req.id] = { id: req.id, code: req.code, info: req.info }
  }

  try {
    const r = newRack()
    const result = await r.registerThing({ id: 'wo-1', info: { type: WORK_ORDER_TYPES.MICROBT_MINER } })
    t.is(receivedReq.code, `IVI-${WORK_ORDER_TYPES.MICROBT_MINER}-0001`)
    t.is(result.id, 'wo-1')
    t.is(result.code, receivedReq.code)
  } finally {
    parent.registerThing = original
  }
})

test('wo-spike: registerThing keeps a caller-supplied code and skips counter generation', async (t) => {
  const parent = Object.getPrototypeOf(WrkWorkOrderRack.prototype)
  const original = parent.registerThing
  parent.registerThing = async function (req) {
    this.mem.things[req.id] = { id: req.id, code: req.code, info: req.info }
  }

  try {
    const r = newRack()
    const result = await r.registerThing({ id: 'wo-2', code: 'MANUAL-1', info: { type: WORK_ORDER_TYPES.MOVE } })
    t.is(result.code, 'MANUAL-1')
    t.is(r._workOrderCounterCache, undefined, 'counter cache untouched when code is supplied')
  } finally {
    parent.registerThing = original
  }
})

test('wo-spike: registerThing returns null when the thing was not stored', async (t) => {
  const parent = Object.getPrototypeOf(WrkWorkOrderRack.prototype)
  const original = parent.registerThing
  parent.registerThing = async function () {}

  try {
    const r = newRack()
    const result = await r.registerThing({ id: 'missing', info: { type: WORK_ORDER_TYPES.MOVE } })
    t.is(result, null)
  } finally {
    parent.registerThing = original
  }
})

test('wo-spike: updateThing delegates to super.updateThing and returns the stored thing', async (t) => {
  const parent = Object.getPrototypeOf(WrkWorkOrderRack.prototype)
  const original = parent.updateThing
  parent.updateThing = async function (req) {
    this.mem.things[req.id] = { id: req.id, info: req.info }
  }

  try {
    const r = newRack()
    const result = await r.updateThing({ id: 'wo-1', info: { status: WORK_ORDER_STATUSES.CLOSED } })
    t.is(result.id, 'wo-1')
    t.is(result.info.status, WORK_ORDER_STATUSES.CLOSED)
  } finally {
    parent.updateThing = original
  }
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

test('wo-file: storeFile requires contentBase64', async (t) => {
  const r = newFileRack()
  r.mem.things = { 'wo-1': { id: 'wo-1', info: {} } }
  await t.exception(
    () => r.storeFile({ ...WO_FILE, workOrderId: 'wo-1', mime: 'text/plain' }),
    /ERR_WO_FILE_CONTENT_REQUIRED/
  )
})

test('wo-file: storeFile rejects a disallowed mime type', async (t) => {
  const r = newFileRack()
  r.mem.things = { 'wo-1': { id: 'wo-1', info: {} } }
  await t.exception(
    () => r.storeFile({
      ...WO_FILE,
      workOrderId: 'wo-1',
      mime: 'application/x-evil',
      contentBase64: Buffer.from('hi').toString('base64')
    }),
    /ERR_FILE_MIME_NOT_ALLOWED/
  )
})

test('wo-file: storeFile rejects content larger than workOrderFileMaxBytes', async (t) => {
  const r = newFileRack()
  r.workOrderFileMaxBytes = 2
  r.mem.things = { 'wo-1': { id: 'wo-1', info: {} } }
  const contentBase64 = Buffer.from('this is definitely too large').toString('base64')
  await t.exception(
    () => r.storeFile({ ...WO_FILE, workOrderId: 'wo-1', mime: 'text/plain', contentBase64 }),
    /ERR_FILE_TOO_LARGE/
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
