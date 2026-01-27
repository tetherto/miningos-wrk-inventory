'use strict'

const test = require('brittle')
const WrkMinerPartRack = require('../../workers/lib/miner_part-worker-base')
const { INVENTORY_TYPES } = require('../../workers/lib/constants')

function createMockWorker () {
  const worker = Object.create(WrkMinerPartRack.prototype)
  worker.mem = { things: {} }
  const parentGetThingType = function () {
    return 'inventory'
  }
  const parentGetThingTags = function () {
    return ['inventory']
  }
  worker.getThingType = function () {
    return parentGetThingType.call(this) + `-${INVENTORY_TYPES.MINER_PART}`
  }
  worker.getThingTags = function () {
    return [...parentGetThingTags.call(this), INVENTORY_TYPES.MINER_PART]
  }
  worker._validateRegisterThing = function (data) {
    // Mock parent validation
  }
  worker._getMaxThingCode = function () {
    return 0
  }
  return worker
}

test('miner_part-worker-base: getThingType should append miner_part', (t) => {
  const worker = createMockWorker()
  const result = worker.getThingType()
  t.is(result, `inventory-${INVENTORY_TYPES.MINER_PART}`)
})

test('miner_part-worker-base: getThingTags should include miner_part tag', (t) => {
  const worker = createMockWorker()
  const tags = worker.getThingTags()
  t.ok(Array.isArray(tags))
  t.ok(tags.includes(INVENTORY_TYPES.MINER_PART))
})

test('miner_part-worker-base: _generateThingCode should throw on unknown part type', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-unknown'
  }

  const data = {
    info: {
      parentDeviceModel: 's19xp',
      subType: 'CB6_V5'
    }
  }

  t.exception(() => {
    worker._generateThingCode(data)
  }, 'ERR_UNKNOWN_PART_TYPE')
})

test('miner_part-worker-base: _generateThingCode should throw when info is missing', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-controller'
  }

  const data = {}

  t.exception(() => {
    worker._generateThingCode(data)
  }, 'ERR_PART_INFO_INVALID')
})

test('miner_part-worker-base: _generateThingCode should throw when parentDeviceModel is missing', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-controller'
  }

  const data = {
    info: {
      subType: 'CB6_V5'
    }
  }

  t.exception(() => {
    worker._generateThingCode(data)
  }, 'ERR_PART_MINER_MODEL_INFO_INVALID')
})

test('miner_part-worker-base: _generateThingCode should throw when subType is missing', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-controller'
  }

  const data = {
    info: {
      parentDeviceModel: 's19xp'
    }
  }

  t.exception(() => {
    worker._generateThingCode(data)
  }, 'ERR_PART_SUBTYPE_INFO_INVALID')
})

test('miner_part-worker-base: _generateThingCode should generate code for controller', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-controller'
  }
  worker._getMaxThingCode = function () {
    return 0
  }

  const data = {
    info: {
      parentDeviceModel: 's19xp',
      subType: 'CB6 V5'
    }
  }

  const code = worker._generateThingCode(data)
  t.is(code, 'CB-S19XP-CB6_V5-01')
})

test('miner_part-worker-base: _generateThingCode should generate code for psu', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-psu'
  }
  worker._getMaxThingCode = function () {
    return 5
  }

  const data = {
    info: {
      parentDeviceModel: 's19pro',
      subType: 'PSU V1'
    }
  }

  const code = worker._generateThingCode(data)
  t.is(code, 'PS-S19PRO-PSU_V1-06')
})

test('miner_part-worker-base: _generateThingCode should generate code for hashboard', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-hashboard'
  }
  worker._getMaxThingCode = function () {
    return 10
  }

  const data = {
    info: {
      parentDeviceModel: 'am',
      subType: 'HB V2'
    }
  }

  const code = worker._generateThingCode(data)
  t.is(code, 'HB-AM-HB_V2-11')
})

test('miner_part-worker-base: _generateThingCode should use seed when provided', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-controller'
  }
  worker._getMaxThingCode = function () {
    return 10
  }

  const data = {
    info: {
      parentDeviceModel: 's19xp',
      subType: 'CB6 V5'
    }
  }

  const code = worker._generateThingCode(data, 5)
  t.is(code, 'CB-S19XP-CB6_V5-05')
})

test('miner_part-worker-base: _generateThingCode should handle single word subType', (t) => {
  const worker = createMockWorker()
  worker.getThingType = function () {
    return 'inventory-miner_part-controller'
  }
  worker._getMaxThingCode = function () {
    return 0
  }

  const data = {
    info: {
      parentDeviceModel: 's19xp',
      subType: 'V5'
    }
  }

  const code = worker._generateThingCode(data)
  t.is(code, 'CB-S19XP-V5-01')
})
