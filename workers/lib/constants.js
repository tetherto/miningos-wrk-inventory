'use strict'

const INVENTORY_TYPES = {
  MINER_PART: 'miner_part',
  CONTAINER_PART: 'container_part',
  OTHERS: 'others'
}

const MINER_PART_TYPES = {
  PSU: { name: 'psu', prefix: 'PS' },
  HASHBOARD: { name: 'hashboard', prefix: 'HB' },
  CONTROLLER: { name: 'controller', prefix: 'CB' }
}

const CONTAINER_PART_TYPES = {
  DRY_COOLER: 'drycooler'
}

module.exports = {
  INVENTORY_TYPES,
  MINER_PART_TYPES,
  CONTAINER_PART_TYPES
}
