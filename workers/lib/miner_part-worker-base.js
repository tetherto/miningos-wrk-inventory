'use strict'

const { INVENTORY_TYPES, MINER_PART_TYPES } = require('./constants')
const { formatAndCapitalize } = require('./utils')
const WrkInventoryRack = require('./worker-base')

class WrkMinerPartRack extends WrkInventoryRack {
  getThingType () {
    return super.getThingType() + `-${INVENTORY_TYPES.MINER_PART}`
  }

  getThingTags () {
    return [...super.getThingTags(), INVENTORY_TYPES.MINER_PART]
  }

  _validateRegisterThing (data) {
    super._validateRegisterThing(data)
  }

  _generateThingCode (data, seed) {
    const partTypeName = this.getThingType().split('-').pop()
    const partType = Object.values(MINER_PART_TYPES).find(type => type.name === partTypeName)

    if (!partType) {
      throw new Error('ERR_UNKNOWN_PART_TYPE')
    }
    if (!data.info) {
      throw new Error('ERR_PART_INFO_INVALID')
    }
    if (!data.info.parentDeviceModel) {
      throw new Error('ERR_PART_MINER_MODEL_INFO_INVALID')
    }
    if (!data.info.subType) {
      throw new Error('ERR_PART_SUBTYPE_INFO_INVALID')
    }

    const minerModel = data.info.parentDeviceModel.toUpperCase()
    const partSubType = formatAndCapitalize(data.info.subType)
    const last = this._getMaxThingCode()
    const nextCode = (seed ?? (last + 1)).toString().padStart(2, '0')

    return `${partType.prefix}-${minerModel}-${partSubType}-${nextCode}`
  }
}
module.exports = WrkMinerPartRack
