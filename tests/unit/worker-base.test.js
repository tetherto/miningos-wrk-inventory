'use strict'

const test = require('brittle')
const WrkInventoryRack = require('../../workers/lib/worker-base')

function createMockWorker () {
  const worker = Object.create(WrkInventoryRack.prototype)
  worker.mem = { things: {} }
  return worker
}

test('worker-base: init should delegate to super.init', (t) => {
  const parent = Object.getPrototypeOf(WrkInventoryRack.prototype)
  const original = parent.init
  let called = false
  parent.init = function () { called = true }
  try {
    const worker = createMockWorker()
    worker.init()
    t.ok(called, 'super.init was invoked')
  } finally {
    parent.init = original
  }
})

test('worker-base: _start should call super._start then whitelist the rack actions', (t) => {
  const parent = Object.getPrototypeOf(WrkInventoryRack.prototype)
  const original = parent._start
  parent._start = function (cb) { cb() }
  try {
    const worker = createMockWorker()
    let whitelisted = null
    worker.miningosThgWriteCalls_0 = {
      whitelistActions: (actions) => { whitelisted = actions }
    }

    let cbErr = 'not-called'
    worker._start((err) => { cbErr = err })

    t.absent(cbErr, '_start callback invoked without error')
    t.alike(whitelisted, [
      ['registerThing', 1],
      ['updateThing', 1],
      ['forgetThings', 1]
    ])
  } finally {
    parent._start = original
  }
})

test('worker-base: getThingType should return inventory', (t) => {
  const worker = createMockWorker()
  t.is(worker.getThingType(), 'inventory')
})

test('worker-base: getThingTags should return inventory tag', (t) => {
  const worker = createMockWorker()
  const tags = worker.getThingTags()
  t.ok(Array.isArray(tags))
  t.ok(tags.includes('inventory'))
})

test('worker-base: getSpecTags should return inventory tag', (t) => {
  const worker = createMockWorker()
  const tags = worker.getSpecTags()
  t.ok(Array.isArray(tags))
  t.ok(tags.includes('inventory'))
})

test('worker-base: selectThingInfo should return info object', (t) => {
  const worker = createMockWorker()
  const thing = { info: { serialNum: '123', status: 'active' } }
  const result = worker.selectThingInfo(thing)
  t.alike(result, { info: thing.info })
})

test('worker-base: collectSnaps should be a no-op', async (t) => {
  const worker = createMockWorker()
  await worker.collectSnaps()
  t.pass('collectSnaps completed without error')
})

test('worker-base: reconnectThing should be a no-op', async (t) => {
  const worker = createMockWorker()
  await worker.reconnectThing()
  t.pass('reconnectThing completed without error')
})

test('worker-base: connectThing should be a no-op', async (t) => {
  const worker = createMockWorker()
  await worker.connectThing({})
  t.pass('connectThing completed without error')
})

test('worker-base: _validatePartDataChange should throw on duplicate serialNum', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    thing1: {
      id: 'thing1',
      info: { serialNum: 'SN123' }
    }
  }

  const data = {
    id: 'thing2',
    info: { serialNum: 'SN123' }
  }

  t.exception(() => {
    worker._validatePartDataChange(data)
  }, 'ERR_THING_SERIALNUM_EXISTS')
})

test('worker-base: _validatePartDataChange should throw on duplicate macAddress', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    thing1: {
      id: 'thing1',
      info: { macAddress: 'AA:BB:CC:DD:EE:FF' }
    }
  }

  const data = {
    id: 'thing2',
    info: { macAddress: 'aa:bb:cc:dd:ee:ff' }
  }

  t.exception(() => {
    worker._validatePartDataChange(data)
  }, 'ERR_THING_MACADDRESS_EXISTS')
})

test('worker-base: _validatePartDataChange should throw on duplicate macAddress with different separators', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    thing1: {
      id: 'thing1',
      info: { macAddress: 'AA:BB:CC:DD:EE:FF' }
    }
  }

  const data = {
    id: 'thing2',
    info: { macAddress: 'aa-bb-cc-dd-ee-ff' }
  }

  t.exception(() => {
    worker._validatePartDataChange(data)
  }, 'ERR_THING_MACADDRESS_EXISTS')
})

test('worker-base: _validatePartDataChange should not throw for same thing', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    thing1: {
      id: 'thing1',
      info: { serialNum: 'SN123' }
    }
  }

  const data = {
    id: 'thing1',
    info: { serialNum: 'SN123' }
  }

  t.execution(() => {
    worker._validatePartDataChange(data)
  })
})

test('worker-base: _validatePartDataChange should validate custom duplicate fields', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    thing1: {
      id: 'thing1',
      info: { parentDeviceId: 'DEV123' }
    }
  }

  const data = {
    id: 'thing2',
    info: { parentDeviceId: 'dev123' }
  }

  t.exception(() => {
    worker._validatePartDataChange(data, ['parentDeviceId'])
  }, 'ERR_THING_PARENTDEVICEID_EXISTS')
})

test('worker-base: _validateParentDeviceData should throw when parentDeviceId and parentDeviceCode mismatch', (t) => {
  const worker = createMockWorker()
  const data = {
    info: {
      parentDeviceId: 'DEV123',
      parentDeviceCode: undefined
    }
  }

  t.exception(() => {
    worker._validateParentDeviceData(data)
  }, 'ERR_PARENT_DEVICE_INFO_INVALID')
})

test('worker-base: _validateParentDeviceData should throw when parentDeviceModel not in parentDeviceType', (t) => {
  const worker = createMockWorker()
  const data = {
    info: {
      parentDeviceType: 'miner-am-s19xp',
      parentDeviceModel: 's19pro'
    }
  }

  t.exception(() => {
    worker._validateParentDeviceData(data)
  }, 'ERR_PARENT_DEVICE_MODEL_TYPE_MISMATCH')
})

test('worker-base: _validateParentDeviceData should pass when parentDeviceModel is in parentDeviceType', (t) => {
  const worker = createMockWorker()
  const data = {
    info: {
      parentDeviceType: 'miner-am-s19xp',
      parentDeviceModel: 's19xp'
    }
  }

  t.execution(() => {
    worker._validateParentDeviceData(data)
  })
})

test('worker-base: _validateParentDeviceData should pass when both parentDeviceId and parentDeviceCode are present', (t) => {
  const worker = createMockWorker()
  const data = {
    info: {
      parentDeviceId: 'DEV123',
      parentDeviceCode: 'DC123'
    }
  }

  t.execution(() => {
    worker._validateParentDeviceData(data)
  })
})

test('worker-base: _validateParentDeviceData should pass when both parentDeviceId and parentDeviceCode are absent', (t) => {
  const worker = createMockWorker()
  const data = {
    info: {}
  }

  t.execution(() => {
    worker._validateParentDeviceData(data)
  })
})

test('worker-base: _validateUpdateThing should throw on parentDeviceType model mismatch', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    thing1: {
      id: 'thing1',
      info: { parentDeviceModel: 's19xp' }
    }
  }

  const data = {
    id: 'thing1',
    info: {
      parentDeviceType: 'miner-am-s19pro'
    }
  }

  t.exception(() => {
    worker._validateUpdateThing(data)
  }, 'ERR_UPDATE_PARENT_DEVICE_TYPE_MODEL_MISMATCH')
})

test('worker-base: _validateUpdateThing rejects location/status changes without workOrderId', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    p1: { id: 'p1', info: { location: 'Lab', status: 'active' } }
  }

  t.exception(
    () => worker._validateUpdateThing({ id: 'p1', info: { location: 'site.lab' } }),
    /ERR_PART_MOVE_REQUIRES_WO/
  )
  t.exception(
    () => worker._validateUpdateThing({ id: 'p1', info: { status: 'in_repair' } }),
    /ERR_PART_MOVE_REQUIRES_WO/
  )
})

test('worker-base: _validateUpdateThing accepts location/status when workOrderId is present', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    p1: { id: 'p1', info: { location: 'Lab', status: 'active' } }
  }

  t.execution(() =>
    worker._validateUpdateThing({ id: 'p1', info: { location: 'site.lab', workOrderId: 'wo-1' } })
  )
})

test('worker-base: _validateUpdateThing leaves non-move updates alone', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    p1: { id: 'p1', info: { serialNum: 'SN1', location: 'Lab', status: 'active' } }
  }

  t.execution(() =>
    worker._validateUpdateThing({ id: 'p1', info: { serialNum: 'SN1' } })
  )
})

test('worker-base: _validateLocation rejects values outside MINER_LOCATIONS', (t) => {
  const worker = createMockWorker()
  worker.mem.things = { p1: { id: 'p1', info: { location: 'site.lab', status: 'active' } } }

  t.exception(
    () => worker._validateUpdateThing({ id: 'p1', info: { location: 'Workshop Lab', workOrderId: 'wo-1' } }),
    /ERR_INVALID_LOCATION/
  )
  t.exception(
    () => worker._validateUpdateThing({ id: 'p1', info: { location: 'Field', workOrderId: 'wo-1' } }),
    /ERR_INVALID_LOCATION/
  )
})

test('worker-base: _validateLocation accepts every canonical MINER_LOCATIONS value', (t) => {
  const { MINER_LOCATIONS } = require('../../workers/lib/constants')
  const worker = createMockWorker()
  worker.mem.things = { p1: { id: 'p1', info: { location: 'site.lab' } } }
  for (const loc of MINER_LOCATIONS) {
    t.execution(
      () => worker._validateUpdateThing({ id: 'p1', info: { location: loc, workOrderId: 'wo-1' } }),
      `accepts "${loc}"`
    )
  }
})

test('worker-base: _validateRegisterThing rejects unknown location', (t) => {
  const worker = createMockWorker()
  t.exception(
    () => worker._validateRegisterThing({ info: { serialNum: 'SN9', location: 'Workshop Lab' } }),
    /ERR_INVALID_LOCATION/
  )
})

test('worker-base: _validateLocation noops when location is absent/null', (t) => {
  const worker = createMockWorker()
  worker.mem.things = { p1: { id: 'p1', info: { location: 'site.lab' } } }
  t.execution(() => worker._validateUpdateThing({ id: 'p1', info: { status: 'active', workOrderId: 'wo-1' } }))
  t.execution(() => worker._validateUpdateThing({ id: 'p1', info: { location: null, workOrderId: 'wo-1' } }))
})

test('worker-base: _validateMacAddress rejects malformed values', (t) => {
  const worker = createMockWorker()
  const badMacs = [
    'AA:BB:CC:DD:EE',
    'AA:BB:CC:DD:EE:FF:00',
    'AABBCCDDEEFF',
    'AA:BB:CC:DD:EE:GG',
    'AA.BB.CC.DD.EE.FF',
    ' AA:BB:CC:DD:EE:FF',
    'AA:BB-CC:DD-EE:FF',
    'AA-BB-CC-DD-EE:FF',
    123
  ]
  for (const macAddress of badMacs) {
    t.exception(
      () => worker._validateMacAddress({ info: { macAddress } }),
      /ERR_THING_MACADDRESS_INVALID/,
      `rejects "${macAddress}"`
    )
  }
})

test('worker-base: _validateMacAddress rejects multicast addresses', (t) => {
  const worker = createMockWorker()
  const multicastMacs = ['01:00:5E:00:00:01', '33:33:00:00:00:01', 'ff:ff:ff:ff:ff:ff', '0B:AA:BB:CC:DD:EE']
  for (const macAddress of multicastMacs) {
    t.exception(
      () => worker._validateMacAddress({ info: { macAddress } }),
      /ERR_THING_MACADDRESS_MULTICAST/,
      `rejects "${macAddress}"`
    )
  }
})

test('worker-base: _validateMacAddress accepts valid unicast addresses', (t) => {
  const worker = createMockWorker()
  const validMacs = ['00:1A:2B:3C:4D:5E', 'aa:bb:cc:dd:ee:ff', 'AA-BB-CC-DD-EE-FF', '02:00:00:00:00:01']
  for (const macAddress of validMacs) {
    t.execution(
      () => worker._validateMacAddress({ info: { macAddress } }),
      `accepts "${macAddress}"`
    )
  }
})

test('worker-base: _validateMacAddress noops when macAddress is absent or empty', (t) => {
  const worker = createMockWorker()
  t.execution(() => worker._validateMacAddress({ info: { serialNum: 'SN1' } }))
  t.execution(() => worker._validateMacAddress({ info: { macAddress: null } }))
  t.execution(() => worker._validateMacAddress({ info: { macAddress: '' } }))
  t.execution(() => worker._validateMacAddress({}))
})

test('worker-base: _validateRegisterThing rejects invalid macAddress', (t) => {
  const worker = createMockWorker()
  t.exception(
    () => worker._validateRegisterThing({ info: { serialNum: 'SN9', macAddress: 'not-a-mac' } }),
    /ERR_THING_MACADDRESS_INVALID/
  )
  t.exception(
    () => worker._validateRegisterThing({ info: { serialNum: 'SN9', macAddress: '01:00:5E:00:00:01' } }),
    /ERR_THING_MACADDRESS_MULTICAST/
  )
})

test('worker-base: _validateUpdateThing rejects invalid macAddress', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    p1: { id: 'p1', info: { serialNum: 'SN1' } }
  }

  t.exception(
    () => worker._validateUpdateThing({ id: 'p1', info: { macAddress: 'not-a-mac' } }),
    /ERR_THING_MACADDRESS_INVALID/
  )
  t.exception(
    () => worker._validateUpdateThing({ id: 'p1', info: { macAddress: '33:33:00:00:00:01' } }),
    /ERR_THING_MACADDRESS_MULTICAST/
  )
  t.execution(
    () => worker._validateUpdateThing({ id: 'p1', info: { macAddress: '00:1A:2B:3C:4D:5E' } })
  )
})

test('worker-base: _validateRegisterThing should throw when info is missing', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {}
  // Mock parent _validateRegisterThing to not throw
  worker._validateRegisterThing = WrkInventoryRack.prototype._validateRegisterThing.bind(worker)

  const data = {
    id: 'thing1'
  }

  t.exception(() => {
    worker._validateRegisterThing(data)
  }, 'ERR_THING_VALIDATE_INFO_INVALID')
})

test('worker-base: _validateRegisterThing should validate part data change', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    thing1: {
      id: 'thing1',
      info: { serialNum: 'SN123' }
    }
  }
  // Mock parent _validateRegisterThing to not throw
  worker._validateRegisterThing = WrkInventoryRack.prototype._validateRegisterThing.bind(worker)

  const data = {
    id: 'thing2',
    info: { serialNum: 'SN123' }
  }

  t.exception(() => {
    worker._validateRegisterThing(data)
  }, 'ERR_THING_SERIALNUM_EXISTS')
})
