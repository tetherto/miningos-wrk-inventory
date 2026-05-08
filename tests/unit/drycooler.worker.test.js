'use strict'

const test = require('brittle')
const WrkDrycoolerContainerPartRack = require('../../workers/drycooler.container_part.rack.inventory.wrk')
const { CONTAINER_PART_TYPES } = require('../../workers/lib/constants')

function createMockWorker () {
  const worker = Object.create(WrkDrycoolerContainerPartRack.prototype)
  worker.mem = { things: {} }
  const parentGetThingType = function () {
    return 'inventory-container_part'
  }
  worker.getThingType = function () {
    return parentGetThingType.call(this) + `-${CONTAINER_PART_TYPES.DRY_COOLER}`
  }
  worker.getThingTags = function () {
    return ['inventory', 'container_part']
  }
  return worker
}

test('drycooler.worker: getThingType should append drycooler', (t) => {
  const worker = createMockWorker()
  const result = worker.getThingType()
  t.is(result, `inventory-container_part-${CONTAINER_PART_TYPES.DRY_COOLER}`)
})

test('drycooler.worker: real getThingType should chain super and append drycooler', (t) => {
  const worker = Object.create(WrkDrycoolerContainerPartRack.prototype)
  const result = WrkDrycoolerContainerPartRack.prototype.getThingType.call(worker)
  t.is(result, `inventory-container_part-${CONTAINER_PART_TYPES.DRY_COOLER}`)
})

test('drycooler.worker: real getThingTags should inherit container_part and inventory tags', (t) => {
  const worker = Object.create(WrkDrycoolerContainerPartRack.prototype)
  const tags = WrkDrycoolerContainerPartRack.prototype.getThingTags.call(worker)
  t.ok(Array.isArray(tags))
  t.ok(tags.includes('inventory'))
  t.ok(tags.includes('container_part'))
})
