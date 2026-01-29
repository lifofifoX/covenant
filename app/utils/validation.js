import * as btc from '@scure/btc-signer'

export function isValidInscriptionId(value) {
  return /^[0-9a-f]{64}i\d+$/i.test(value)
}

export function normalizeOrdinalAddress(value) {
  try {
    const decoded = btc.Address().decode(value)
    return btc.Address().encode(decoded)
  } catch {
    return null
  }
}
