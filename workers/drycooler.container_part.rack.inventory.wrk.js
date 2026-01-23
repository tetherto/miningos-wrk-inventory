'use strict'

const { CONTAINER_PART_TYPES } = require('./lib/constants')
const WrkContainerPartRack = require('./lib/container_part-worker-base')

class WrkDrycoolerContainerPartRack extends WrkContainerPartRack {
  getThingType () {
    return super.getThingType() + `-${CONTAINER_PART_TYPES.DRY_COOLER}`
  }
}

module.exports = WrkDrycoolerContainerPartRack
