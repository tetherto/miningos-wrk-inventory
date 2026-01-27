'use strict'

const { MINER_PART_TYPES } = require('./lib/constants.js')
const WrkMinerPartRack = require('./lib/miner_part-worker-base.js')

class WrkPsuMinerPartRack extends WrkMinerPartRack {
  getThingType () {
    return super.getThingType() + `-${MINER_PART_TYPES.PSU.name}`
  }

  _validateRegisterThing (data) {
    super._validateRegisterThing(data)
    if (!data.info.serialNum) {
      throw new Error('ERR_THING_VALIDATE_SERIAL_NUMBER_REQUIRED')
    }
  }
}

module.exports = WrkPsuMinerPartRack
