'use strict'

const test = require('brittle')
const WrkInventoryRack = require('../../workers/lib/worker-base')

function createMockWorker () {
  const worker = Object.create(WrkInventoryRack.prototype)
  worker.mem = { things: {} }
  return worker
}

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
