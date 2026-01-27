'use strict'

const test = require('brittle')
const WrkControllerMinerPartRack = require('../../workers/controller.miner_part.rack.inventory.wrk')
const { MINER_PART_TYPES } = require('../../workers/lib/constants')

function createMockWorker () {
  const worker = Object.create(WrkControllerMinerPartRack.prototype)
  worker.mem = { things: {} }
  const parentGetThingType = function () {
    return 'inventory-miner_part'
  }
  worker.getThingType = function () {
    return parentGetThingType.call(this) + `-${MINER_PART_TYPES.CONTROLLER.name}`
  }
  worker.getThingTags = function () {
    return ['inventory', 'miner_part']
  }
  worker._validateRegisterThing = function (data) {
    if (!data.info) {
      throw new Error('ERR_THING_VALIDATE_INFO_INVALID')
    }
  }
  worker._validatePartDataChange = WrkControllerMinerPartRack.prototype._validatePartDataChange.bind(worker)
  return worker
}

test('controller.worker: getThingType should append controller name', (t) => {
  const worker = createMockWorker()
  const result = worker.getThingType()
  t.is(result, `inventory-miner_part-${MINER_PART_TYPES.CONTROLLER.name}`)
})

test('controller.worker: _validatePartDataChange should validate parentDeviceId and parentDeviceCode', (t) => {
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
    worker._validatePartDataChange(data)
  }, 'ERR_THING_PARENTDEVICEID_EXISTS')
})

test('controller.worker: _validatePartDataChange should validate parentDeviceCode', (t) => {
  const worker = createMockWorker()
  worker.mem.things = {
    thing1: {
      id: 'thing1',
      info: { parentDeviceCode: 'DC123' }
    }
  }

  const data = {
    id: 'thing2',
    info: { parentDeviceCode: 'dc123' }
  }

  t.exception(() => {
    worker._validatePartDataChange(data)
  }, 'ERR_THING_PARENTDEVICECODE_EXISTS')
})

test('controller.worker: _validateRegisterThing should throw when both serialNum and macAddress are missing', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkControllerMinerPartRack.prototype._validateRegisterThing.bind(worker)
  worker.mem.things = {}

  const data = {
    info: {}
  }

  t.exception(() => {
    worker._validateRegisterThing(data)
  }, 'ERR_THING_VALIDATE_MAC_OR_SERIAL_REQUIRED')
})

test('controller.worker: _validateRegisterThing should pass with serialNum', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkControllerMinerPartRack.prototype._validateRegisterThing.bind(worker)
  worker.mem.things = {}

  const data = {
    info: {
      serialNum: 'SN123'
    }
  }

  t.execution(() => {
    worker._validateRegisterThing(data)
  })
})

test('controller.worker: _validateRegisterThing should pass with macAddress', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkControllerMinerPartRack.prototype._validateRegisterThing.bind(worker)
  worker.mem.things = {}

  const data = {
    info: {
      macAddress: 'AA:BB:CC:DD:EE:FF'
    }
  }

  t.execution(() => {
    worker._validateRegisterThing(data)
  })
})

test('controller.worker: _validateRegisterThing should pass with both serialNum and macAddress', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkControllerMinerPartRack.prototype._validateRegisterThing.bind(worker)
  worker.mem.things = {}

  const data = {
    info: {
      serialNum: 'SN123',
      macAddress: 'AA:BB:CC:DD:EE:FF'
    }
  }

  t.execution(() => {
    worker._validateRegisterThing(data)
  })
})
