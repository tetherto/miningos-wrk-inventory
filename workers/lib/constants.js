'use strict'

const INVENTORY_TYPES = {
  MINER_PART: 'miner_part',
  CONTAINER_PART: 'container_part',
  OTHERS: 'others'
}

const MINER_PART_TYPES = {
  PSU: { name: 'psu', prefix: 'PS' },
  HASHBOARD: { name: 'hashboard', prefix: 'HB' },
  CONTROLLER: { name: 'controller', prefix: 'CB' }
}

const CONTAINER_PART_TYPES = {
  DRY_COOLER: 'drycooler'
}

const WORK_ORDER_THING_TYPE = 'work_order'

const WORK_ORDER_TYPES = {
  REGISTER: 1,
  REGULAR: 2
}

const WORK_ORDER_STATUSES = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  CLOSED: 'closed',
  CANCELLED: 'cancelled'
}

const WORK_ORDER_TERMINAL_STATUSES = new Set([
  WORK_ORDER_STATUSES.CLOSED,
  WORK_ORDER_STATUSES.CANCELLED
])

const WORK_ORDER_VALID_TRANSITIONS = {
  [WORK_ORDER_STATUSES.OPEN]: new Set([
    WORK_ORDER_STATUSES.IN_PROGRESS,
    WORK_ORDER_STATUSES.CLOSED,
    WORK_ORDER_STATUSES.CANCELLED
  ]),
  [WORK_ORDER_STATUSES.IN_PROGRESS]: new Set([
    WORK_ORDER_STATUSES.CLOSED,
    WORK_ORDER_STATUSES.CANCELLED
  ]),
  [WORK_ORDER_STATUSES.CLOSED]: new Set(),
  [WORK_ORDER_STATUSES.CANCELLED]: new Set()
}

const WORK_ORDER_DEFAULT_PREFIX = 'IVI'

const WORK_ORDER_VALID_DEVICE_TYPES = ['miner', 'psu', 'hashboard', 'controller']

const MINER_LOCATIONS = ['Site Warehouse', 'Site Lab', 'Miner Room', 'Vendor', 'Scrapped', 'Disposed']

const SPARE_PART_INITIAL_LOCATION = 'Site Warehouse'

const WORK_ORDER_FILE_MAX_BYTES_DEFAULT = 10 * 1024 * 1024
const WORK_ORDER_FILE_MIME_ALLOWLIST_DEFAULT = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain', 'text/csv', 'application/json'
]
const WORK_ORDER_FILE_RPC_METHODS = [
  'storeWorkOrderFile',
  'loadWorkOrderFile',
  'removeWorkOrderFile'
]

module.exports = {
  INVENTORY_TYPES,
  MINER_PART_TYPES,
  CONTAINER_PART_TYPES,
  WORK_ORDER_THING_TYPE,
  WORK_ORDER_TYPES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TERMINAL_STATUSES,
  WORK_ORDER_VALID_TRANSITIONS,
  WORK_ORDER_DEFAULT_PREFIX,
  WORK_ORDER_FILE_MAX_BYTES_DEFAULT,
  WORK_ORDER_FILE_MIME_ALLOWLIST_DEFAULT,
  WORK_ORDER_FILE_RPC_METHODS,
  WORK_ORDER_VALID_DEVICE_TYPES,
  SPARE_PART_INITIAL_LOCATION,
  MINER_LOCATIONS
}
