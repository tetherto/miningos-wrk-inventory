'use strict'

const test = require('brittle')
const libStats = require('../../workers/lib/stats')

test('stats: should expose specs and conf from underlying lib', (t) => {
  t.ok(libStats.specs, 'specs is present')
  t.ok(libStats.conf, 'conf is present')
})

test('stats: should preserve default ops alongside inventory ops', (t) => {
  t.ok(libStats.specs.default, 'default spec is preserved')
  t.ok(libStats.specs.default.ops.alerts_cnt, 'default alerts_cnt op preserved')
})

test('stats: should register the inventory spec', (t) => {
  t.ok(libStats.specs.inventory, 'inventory spec is registered')
  t.ok(libStats.specs.inventory.ops, 'inventory ops are present')
})

test('stats: inventory spec should inherit default ops', (t) => {
  const ops = libStats.specs.inventory.ops
  t.ok(ops.alerts_cnt, 'alerts_cnt op inherited from default')
  t.is(ops.alerts_cnt.op, 'alerts_group_cnt')
})

test('stats: inventory spec should define spare_parts_cnt op', (t) => {
  const ops = libStats.specs.inventory.ops
  t.ok(ops.spare_parts_cnt, 'spare_parts_cnt op present')
  t.is(ops.spare_parts_cnt.op, 'cnt')
  t.is(ops.spare_parts_cnt.src, 'info')
})

test('stats: inventory spec should define spare_parts_type_group_cnt op', (t) => {
  const ops = libStats.specs.inventory.ops
  t.ok(ops.spare_parts_type_group_cnt, 'op present')
  t.is(ops.spare_parts_type_group_cnt.op, 'group_cnt')
  t.is(typeof ops.spare_parts_type_group_cnt.group, 'function')
})

test('stats: inventory spec should define spare_part_inventory_status_group_cnt op', (t) => {
  const ops = libStats.specs.inventory.ops
  t.ok(ops.spare_part_inventory_status_group_cnt, 'op present')
  t.is(ops.spare_part_inventory_status_group_cnt.op, 'group_cnt')
  t.is(typeof ops.spare_part_inventory_status_group_cnt.group, 'function')
})

test('stats: inventory spec should define spare_part_inventory_location_group_cnt op', (t) => {
  const ops = libStats.specs.inventory.ops
  t.ok(ops.spare_part_inventory_location_group_cnt, 'op present')
  t.is(ops.spare_part_inventory_location_group_cnt.op, 'group_cnt')
  t.is(typeof ops.spare_part_inventory_location_group_cnt.group, 'function')
})

test('stats: type group_cnt grouping function should return field value', (t) => {
  const groupFn = libStats.specs.inventory.ops.spare_parts_type_group_cnt.group
  const entry = {}
  const ext = { type: 'psu' }
  t.is(groupFn(entry, ext), 'psu')
})

test('stats: status group_cnt grouping function should resolve nested info.status', (t) => {
  const groupFn = libStats.specs.inventory.ops.spare_part_inventory_status_group_cnt.group
  const entry = {}
  const ext = { info: { status: 'spare' } }
  t.is(groupFn(entry, ext), 'spare')
})

test('stats: location group_cnt grouping function should resolve nested info.location', (t) => {
  const groupFn = libStats.specs.inventory.ops.spare_part_inventory_location_group_cnt.group
  const entry = {}
  const ext = { info: { location: 'rack-1' } }
  t.is(groupFn(entry, ext), 'rack-1')
})

test('stats: grouping function should return null when ext is missing', (t) => {
  const groupFn = libStats.specs.inventory.ops.spare_parts_type_group_cnt.group
  t.is(groupFn({}, null), null)
  t.is(groupFn({}, undefined), null)
})
