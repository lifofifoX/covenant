import * as btc from '@scure/btc-signer'
import { base64 } from '@scure/base'

export function parseSignedPsbt(signedPsbt) {
  try {
    return btc.Transaction.fromPSBT(base64.decode(signedPsbt))
  } catch {
    const error = new Error('Invalid PSBT')
    error.code = 'invalid_psbt'
    error.status = 400
    throw error
  }
}
