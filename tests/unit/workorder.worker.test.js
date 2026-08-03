'use strict'

const test = require('brittle')
const WrkWorkOrderRack = require('../../workers/workorder.rack.inventory.wrk')
const WrkWorkOrderRackBase = require('../../workers/lib/workorder-worker-base')

test('workorder.worker: re-exports the workorder base worker unchanged', (t) => {
  t.is(WrkWorkOrderRack, WrkWorkOrderRackBase)
})
