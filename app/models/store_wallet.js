import * as btc from '@scure/btc-signer'
import { hex } from '@scure/base'
import { pubSchnorr } from '@scure/btc-signer/utils.js'

export class StoreWallet {
  #p2tr
  #privateKeyBytes

  static fromEnv(env, envKey = 'SELLING_WALLET_PRIVATE_KEY') {
    const privateKey = env[envKey]
    if (!privateKey) throw new Error(`Missing ${envKey}`)

    return new StoreWallet({ privateKey })
  }

  constructor({ privateKey }) {
    this.#privateKeyBytes = hex.decode(privateKey)
    this.#p2tr = btc.p2tr(pubSchnorr(this.#privateKeyBytes))
  }

  get taprootAddress() {
    return this.#p2tr.address
  }

  get tapInternalKey() {
    return this.#p2tr.tapInternalKey
  }

  signTxInput(tx, inputIndex) {
    tx.signIdx(this.#privateKeyBytes, inputIndex)
  }
}
