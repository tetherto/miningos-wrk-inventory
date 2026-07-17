'use strict'

const libStats = require('@tetherto/miningos-tpl-wrk-thing/workers/lib/stats')
const { groupBy } = require('@tetherto/miningos-lib-stats/utils')

const notAttachedToMiner = ({ info }) => !(info?.parentDeviceId || info?.parentDeviceSN)

libStats.specs.inventory = {
  ops: {
    ...libStats.specs.default.ops,
    spare_parts_cnt: {
      op: 'cnt',
      src: 'info',
      filter: notAttachedToMiner
    },
    spare_parts_type_group_cnt: {
      op: 'group_cnt',
      group: groupBy('type'),
      filter: notAttachedToMiner
    },
    spare_part_inventory_status_group_cnt: {
      op: 'group_cnt',
      group: groupBy('info.status'),
      filter: notAttachedToMiner
    },
    spare_part_inventory_location_group_cnt: {
      op: 'group_cnt',
      group: groupBy('info.location'),
      filter: notAttachedToMiner
    }
  }
}

module.exports = libStats
