'use strict'

const test = require('brittle')
const { formatAndCapitalize } = require('../../workers/lib/utils')

test('formatAndCapitalize: should format two words with underscore and uppercase', (t) => {
  const result = formatAndCapitalize('hello world')
  t.is(result, 'HELLO_WORLD')
})

test('formatAndCapitalize: should uppercase single word', (t) => {
  const result = formatAndCapitalize('hello')
  t.is(result, 'HELLO')
})

test('formatAndCapitalize: should handle multiple spaces between words', (t) => {
  const result = formatAndCapitalize('hello    world')
  t.is(result, 'HELLO_WORLD')
})

test('formatAndCapitalize: should trim leading and trailing whitespace', (t) => {
  const result = formatAndCapitalize('  hello world  ')
  t.is(result, 'HELLO_WORLD')
})

test('formatAndCapitalize: should handle empty string', (t) => {
  const result = formatAndCapitalize('')
  t.is(result, '')
})

test('formatAndCapitalize: should handle only whitespace', (t) => {
  const result = formatAndCapitalize('   ')
  // After trim, empty string split returns [''], so it returns input.toUpperCase() which is the whitespace
  // This is the current behavior of the function
  t.is(result, '   ')
})

test('formatAndCapitalize: should handle three or more words as single uppercase', (t) => {
  const result = formatAndCapitalize('hello world test')
  t.is(result, 'HELLO WORLD TEST')
})

test('formatAndCapitalize: should handle mixed case input', (t) => {
  const result = formatAndCapitalize('Hello World')
  t.is(result, 'HELLO_WORLD')
})
