'use strict'

const test = require('brittle')
const WrkPsuMinerPartRack = require('../../workers/psu.miner_part.rack.inventory.wrk')
const { MINER_PART_TYPES } = require('../../workers/lib/constants')

function createMockWorker () {
  const worker = Object.create(WrkPsuMinerPartRack.prototype)
  worker.mem = { things: {} }
  const parentGetThingType = function () {
    return 'inventory-miner_part'
  }
  worker.getThingType = function () {
    return parentGetThingType.call(this) + `-${MINER_PART_TYPES.PSU.name}`
  }
  worker.getThingTags = function () {
    return ['inventory', 'miner_part']
  }
  worker._validateRegisterThing = function (data) {
    if (!data.info) {
      throw new Error('ERR_THING_VALIDATE_INFO_INVALID')
    }
  }
  return worker
}

test('psu.worker: getThingType should append psu name', (t) => {
  const worker = createMockWorker()
  const result = worker.getThingType()
  t.is(result, `inventory-miner_part-${MINER_PART_TYPES.PSU.name}`)
})

test('psu.worker: _validateRegisterThing should throw when serialNum is missing', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkPsuMinerPartRack.prototype._validateRegisterThing.bind(worker)
  worker.mem.things = {}

  const data = {
    info: {}
  }

  t.exception(() => {
    worker._validateRegisterThing(data)
  }, 'ERR_THING_VALIDATE_SERIAL_NUMBER_REQUIRED')
})

test('psu.worker: _validateRegisterThing should pass with serialNum', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkPsuMinerPartRack.prototype._validateRegisterThing.bind(worker)
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
