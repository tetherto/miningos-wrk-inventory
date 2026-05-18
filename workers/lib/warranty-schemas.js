'use strict'

const SCHEMAS = {
  microbt: {
    required: ['rmaNumber', 'faultCode'],
    optional: ['photos', 'notes', 'serialPhoto']
  },
  bitmain: {
    required: ['rmaNumber', 'claimReason'],
    optional: ['photos', 'serialPhoto', 'firmware']
  },
  avalon: {
    required: ['ticketId', 'faultDescription'],
    optional: ['photos', 'firmware']
  }
}

function validateWarranty (warranty) {
  if (warranty === null || warranty === undefined) return
  if (typeof warranty !== 'object' || Array.isArray(warranty)) {
    throw new Error('ERR_WARRANTY_INVALID')
  }
  if (warranty.vendor === null || warranty.vendor === undefined) return
  const schema = SCHEMAS[warranty.vendor]
  if (!schema) throw new Error('ERR_UNKNOWN_VENDOR')
  const fields = warranty.fields
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new Error('ERR_WARRANTY_FIELDS_INVALID')
  }
  const allowed = new Set([...schema.required, ...schema.optional])
  const unknown = Object.keys(fields).filter((k) => !allowed.has(k))
  if (unknown.length) {
    throw new Error(`ERR_WARRANTY_UNKNOWN_FIELDS:${unknown.join(',')}`)
  }
  const missing = schema.required.filter((k) => {
    const v = fields[k]
    return typeof v !== 'string' || !v.trim()
  })
  if (missing.length) {
    throw new Error(`ERR_WARRANTY_MISSING_FIELDS:${missing.join(',')}`)
  }
}

module.exports = { SCHEMAS, validateWarranty }
