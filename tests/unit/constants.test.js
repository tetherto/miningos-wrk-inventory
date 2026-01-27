'use strict'

const test = require('brittle')
const { INVENTORY_TYPES, MINER_PART_TYPES, CONTAINER_PART_TYPES } = require('../../workers/lib/constants')

test('constants: INVENTORY_TYPES should have correct values', (t) => {
  t.is(INVENTORY_TYPES.MINER_PART, 'miner_part')
  t.is(INVENTORY_TYPES.CONTAINER_PART, 'container_part')
  t.is(INVENTORY_TYPES.OTHERS, 'others')
})

test('constants: MINER_PART_TYPES should have correct structure', (t) => {
  t.is(MINER_PART_TYPES.PSU.name, 'psu')
  t.is(MINER_PART_TYPES.PSU.prefix, 'PS')
  t.is(MINER_PART_TYPES.HASHBOARD.name, 'hashboard')
  t.is(MINER_PART_TYPES.HASHBOARD.prefix, 'HB')
  t.is(MINER_PART_TYPES.CONTROLLER.name, 'controller')
  t.is(MINER_PART_TYPES.CONTROLLER.prefix, 'CB')
})

test('constants: CONTAINER_PART_TYPES should have correct value', (t) => {
  t.is(CONTAINER_PART_TYPES.DRY_COOLER, 'drycooler')
})
