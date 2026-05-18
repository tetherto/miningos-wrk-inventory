'use strict'

const test = require('brittle')
const { SCHEMAS, validateWarranty } = require('../../workers/lib/warranty-schemas')

test('warranty-schemas: registers microbt / bitmain / avalon', (t) => {
  t.ok(SCHEMAS.microbt, 'microbt registered')
  t.ok(SCHEMAS.bitmain, 'bitmain registered')
  t.ok(SCHEMAS.avalon, 'avalon registered')
})

test('warranty-schemas: validateWarranty noops on null / undefined / { vendor: null }', (t) => {
  t.execution(() => validateWarranty(null))
  t.execution(() => validateWarranty(undefined))
  t.execution(() => validateWarranty({ vendor: null, fields: {} }))
})

test('warranty-schemas: validateWarranty rejects non-object', (t) => {
  t.exception(() => validateWarranty('nope'), /ERR_WARRANTY_INVALID/)
  t.exception(() => validateWarranty([]), /ERR_WARRANTY_INVALID/)
})

test('warranty-schemas: validateWarranty throws ERR_UNKNOWN_VENDOR for unknown vendor', (t) => {
  t.exception(() => validateWarranty({ vendor: 'unknown', fields: {} }), /ERR_UNKNOWN_VENDOR/)
})

test('warranty-schemas: validateWarranty rejects non-object fields', (t) => {
  t.exception(() => validateWarranty({ vendor: 'microbt' }), /ERR_WARRANTY_FIELDS_INVALID/)
  t.exception(() => validateWarranty({ vendor: 'microbt', fields: 'nope' }), /ERR_WARRANTY_FIELDS_INVALID/)
  t.exception(() => validateWarranty({ vendor: 'microbt', fields: [] }), /ERR_WARRANTY_FIELDS_INVALID/)
})

test('warranty-schemas: microbt requires rmaNumber + faultCode', (t) => {
  t.exception(
    () => validateWarranty({ vendor: 'microbt', fields: {} }),
    /ERR_WARRANTY_MISSING_FIELDS:rmaNumber,faultCode/
  )
  t.exception(
    () => validateWarranty({ vendor: 'microbt', fields: { rmaNumber: 'RMA-1' } }),
    /ERR_WARRANTY_MISSING_FIELDS:faultCode/
  )
  t.execution(
    () => validateWarranty({ vendor: 'microbt', fields: { rmaNumber: 'RMA-1', faultCode: 'E03' } })
  )
})

test('warranty-schemas: bitmain requires rmaNumber + claimReason', (t) => {
  t.exception(
    () => validateWarranty({ vendor: 'bitmain', fields: { rmaNumber: 'X' } }),
    /ERR_WARRANTY_MISSING_FIELDS:claimReason/
  )
  t.execution(
    () => validateWarranty({ vendor: 'bitmain', fields: { rmaNumber: 'X', claimReason: 'fan failure' } })
  )
})

test('warranty-schemas: avalon requires ticketId + faultDescription', (t) => {
  t.exception(
    () => validateWarranty({ vendor: 'avalon', fields: {} }),
    /ERR_WARRANTY_MISSING_FIELDS:ticketId,faultDescription/
  )
  t.execution(
    () => validateWarranty({ vendor: 'avalon', fields: { ticketId: 'T-1', faultDescription: 'short circuit' } })
  )
})

test('warranty-schemas: required field rejects whitespace-only strings', (t) => {
  t.exception(
    () => validateWarranty({ vendor: 'microbt', fields: { rmaNumber: '   ', faultCode: 'E03' } }),
    /ERR_WARRANTY_MISSING_FIELDS:rmaNumber/
  )
})
