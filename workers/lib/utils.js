'use strict'

function formatAndCapitalize (input) {
  const words = input.trim().split(/\s+/)
  if (words.length === 2) {
    return `${words[0]}_${words[1]}`.toUpperCase()
  }
  return input.toUpperCase()
}

module.exports = {
  formatAndCapitalize
}
