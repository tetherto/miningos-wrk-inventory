'use strict'

const { MINER_PART_TYPES } = require('./lib/constants')
const WrkMinerPartRack = require('./lib/miner_part-worker-base')

class WrkControllerMinerPartRack extends WrkMinerPartRack {
  getThingType () {
    return super.getThingType() + `-${MINER_PART_TYPES.CONTROLLER.name}`
  }

  _validatePartDataChange (data, validateDuplicateFields = []) {
    super._validatePartDataChange(data, ['parentDeviceId', 'parentDeviceCode'])
  }

  _validateRegisterThing (data) {
    super._validateRegisterThing(data)
    if (!data?.info?.serialNum && !data?.info?.macAddress) {
      throw new Error('ERR_THING_VALIDATE_MAC_OR_SERIAL_REQUIRED')
    }
  }
}

module.exports = WrkControllerMinerPartRack
