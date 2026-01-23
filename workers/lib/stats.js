'use strict'

const libStats = require('miningos-tpl-wrk-thing/workers/lib/stats')
const { groupBy } = require('miningos-lib-stats/utils')

libStats.specs.inventory = {
  ops: {
    ...libStats.specs.default.ops,
    spare_parts_cnt: {
      op: 'cnt',
      src: 'info'
    },
    spare_parts_type_group_cnt: {
      op: 'group_cnt',
      group: groupBy('type')
    },
    spare_part_inventory_status_group_cnt: {
      op: 'group_cnt',
      group: groupBy('info.status')
    },
    spare_part_inventory_location_group_cnt: {
      op: 'group_cnt',
      group: groupBy('info.location')
    }
  }
}

module.exports = libStats
