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
