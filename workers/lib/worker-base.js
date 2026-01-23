'use strict'

const async = require('async')
const WrkRack = require('miningos-tpl-wrk-thing/workers/rack.thing.wrk')

class WrkInventoryRack extends WrkRack {
  init () {
    super.init()
  }

  _start (cb) {
    async.series([
      (next) => { super._start(next) },
      (next) => {
        this._addWhitelistedActions([
          ['registerThing', 1],
          ['updateThing', 1],
          ['forgetThings', 1]
        ])
        next()
      }
    ], cb)
  }

  getThingType () {
    return 'inventory'
  }

  selectThingInfo (thg) {
    return {
      info: thg.info
    }
  }

  getThingTags () {
    return ['inventory']
  }

  getSpecTags () {
    return ['inventory']
  }

  async collectSnaps () {
    // no op
  }

  async reconnectThing () {
    // no op
  }

  async connectThing (thg) {
    // no-op
  }

  _validatePartDataChange (data, validateDuplicateFields = []) {
    // find thing with same serial-num or mac
    for (const k in this.mem.things) {
      const t = this.mem.things[k]
      const isSameThing = t.id === data.id
      if (isSameThing) continue
      if (t.info?.serialNum && t.info.serialNum === data.info?.serialNum) {
        throw new Error('ERR_THING_SERIALNUM_EXISTS')
      }
      if (
        t.info?.macAddress &&
        t.info.macAddress.toLowerCase() === data.info?.macAddress?.toLowerCase()
      ) {
        throw new Error('ERR_THING_MACADDRESS_EXISTS')
      }
      validateDuplicateFields.forEach(field => {
        if (
          t.info?.[field] &&
          t.info?.[field]?.toLowerCase() === data.info?.[field]?.toLowerCase()
        ) {
          throw new Error(`ERR_THING_${String(field).toUpperCase()}_EXISTS`)
        }
      })
    }
  }

  _validateUpdateThing (data) {
    this._validatePartDataChange(data)
    this._validateParentDeviceData(data)
    if (data.info?.parentDeviceType) {
      const oldThing = this.mem.things[data.id]
      if (
        !data.info?.parentDeviceType.includes(oldThing.info?.parentDeviceModel)
      ) {
        throw new Error('ERR_UPDATE_PARENT_DEVICE_TYPE_MODEL_MISMATCH')
      }
    }
  }

  _validateParentDeviceData (data) {
    const hasParentDeviceId = !!data?.info?.parentDeviceId
    const hasParentDeviceCode = !!data?.info?.parentDeviceCode
    const hasParentDeviceType = data?.info?.parentDeviceType
    const hasParentDeviceModel = data?.info?.parentDeviceModel

    if (hasParentDeviceId !== hasParentDeviceCode) {
      throw new Error('ERR_PARENT_DEVICE_INFO_INVALID')
    }
    if (
      hasParentDeviceModel &&
      hasParentDeviceType &&
      !data?.info?.parentDeviceType.includes(data?.info?.parentDeviceModel)
    ) {
      throw new Error('ERR_PARENT_DEVICE_MODEL_TYPE_MISMATCH')
    }
  }

  _validateRegisterThing (data) {
    super._validateRegisterThing(data)
    if (!data.info) {
      throw new Error('ERR_THING_VALIDATE_INFO_INVALID')
    }
    this._validatePartDataChange(data)
    this._validateParentDeviceData(data)
  }
}

module.exports = WrkInventoryRack
