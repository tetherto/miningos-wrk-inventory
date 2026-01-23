'use strict'

const { INVENTORY_TYPES } = require('./constants')
const WrkInventoryRack = require('./worker-base')

class WrkContainerPartRack extends WrkInventoryRack {
  getThingType () {
    return super.getThingType() + `-${INVENTORY_TYPES.CONTAINER_PART}`
  }

  getThingTags () {
    return [...super.getThingTags(), INVENTORY_TYPES.CONTAINER_PART]
  }

  _validateRegisterThing (data) {
    super._validateRegisterThing(data)
    if (!data.info.serialNum) {
      throw new Error('ERR_THING_VALIDATE_SERIAL_NUMBER_REQUIRED')
    }
    if (!data.info.container) {
      throw new Error('ERR_THING_VALIDATE_CONTAINER_REQUIRED')
    }
  }
}
module.exports = WrkContainerPartRack
