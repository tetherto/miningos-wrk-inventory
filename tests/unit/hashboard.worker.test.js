'use strict'

const test = require('brittle')
const WrkHashboardMinerPartRack = require('../../workers/hashboard.miner_part.rack.inventory.wrk')
const { MINER_PART_TYPES } = require('../../workers/lib/constants')

function createMockWorker () {
  const worker = Object.create(WrkHashboardMinerPartRack.prototype)
  worker.mem = { things: {} }
  const parentGetThingType = function () {
    return 'inventory-miner_part'
  }
  worker.getThingType = function () {
    return parentGetThingType.call(this) + `-${MINER_PART_TYPES.HASHBOARD.name}`
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

test('hashboard.worker: getThingType should append hashboard name', (t) => {
  const worker = createMockWorker()
  const result = worker.getThingType()
  t.is(result, `inventory-miner_part-${MINER_PART_TYPES.HASHBOARD.name}`)
})

test('hashboard.worker: _validateRegisterThing should throw when serialNum is missing', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkHashboardMinerPartRack.prototype._validateRegisterThing.bind(worker)
  worker.mem.things = {}

  const data = {
    info: {}
  }

  t.exception(() => {
    worker._validateRegisterThing(data)
  }, 'ERR_THING_VALIDATE_SERIAL_NUMBER_REQUIRED')
})

test('hashboard.worker: _validateRegisterThing should pass with serialNum', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkHashboardMinerPartRack.prototype._validateRegisterThing.bind(worker)
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

test('hashboard.worker: real getThingType should chain super and append hashboard', (t) => {
  const worker = Object.create(WrkHashboardMinerPartRack.prototype)
  const result = WrkHashboardMinerPartRack.prototype.getThingType.call(worker)
  t.is(result, `inventory-miner_part-${MINER_PART_TYPES.HASHBOARD.name}`)
})

test('hashboard.worker: real getThingTags should inherit miner_part and inventory tags', (t) => {
  const worker = Object.create(WrkHashboardMinerPartRack.prototype)
  const tags = WrkHashboardMinerPartRack.prototype.getThingTags.call(worker)
  t.ok(Array.isArray(tags))
  t.ok(tags.includes('inventory'))
  t.ok(tags.includes('miner_part'))
})
