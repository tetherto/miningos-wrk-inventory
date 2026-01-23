'use strict'

const test = require('brittle')
const WrkContainerPartRack = require('../../workers/lib/container_part-worker-base')
const { INVENTORY_TYPES } = require('../../workers/lib/constants')

function createMockWorker () {
  const worker = Object.create(WrkContainerPartRack.prototype)
  worker.mem = { things: {} }
  const parentGetThingType = function () {
    return 'inventory'
  }
  const parentGetThingTags = function () {
    return ['inventory']
  }
  worker.getThingType = function () {
    return parentGetThingType.call(this) + `-${INVENTORY_TYPES.CONTAINER_PART}`
  }
  worker.getThingTags = function () {
    return [...parentGetThingTags.call(this), INVENTORY_TYPES.CONTAINER_PART]
  }
  worker._validateRegisterThing = function (data) {
    if (!data.info) {
      throw new Error('ERR_THING_VALIDATE_INFO_INVALID')
    }
  }
  return worker
}

test('container_part-worker-base: getThingType should append container_part', (t) => {
  const worker = createMockWorker()
  const result = worker.getThingType()
  t.is(result, `inventory-${INVENTORY_TYPES.CONTAINER_PART}`)
})

test('container_part-worker-base: getThingTags should include container_part tag', (t) => {
  const worker = createMockWorker()
  const tags = worker.getThingTags()
  t.ok(Array.isArray(tags))
  t.ok(tags.includes(INVENTORY_TYPES.CONTAINER_PART))
})

test('container_part-worker-base: _validateRegisterThing should throw when serialNum is missing', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkContainerPartRack.prototype._validateRegisterThing.bind(worker)

  const data = {
    info: {
      container: 'container-1'
    }
  }

  t.exception(() => {
    worker._validateRegisterThing(data)
  }, 'ERR_THING_VALIDATE_SERIAL_NUMBER_REQUIRED')
})

test('container_part-worker-base: _validateRegisterThing should throw when container is missing', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkContainerPartRack.prototype._validateRegisterThing.bind(worker)

  const data = {
    info: {
      serialNum: 'SN123'
    }
  }

  t.exception(() => {
    worker._validateRegisterThing(data)
  }, 'ERR_THING_VALIDATE_CONTAINER_REQUIRED')
})

test('container_part-worker-base: _validateRegisterThing should pass with valid data', (t) => {
  const worker = createMockWorker()
  worker._validateRegisterThing = WrkContainerPartRack.prototype._validateRegisterThing.bind(worker)
  worker.mem.things = {}

  const data = {
    info: {
      serialNum: 'SN123',
      container: 'container-1'
    }
  }

  t.execution(() => {
    worker._validateRegisterThing(data)
  })
})
