import * as btc from '@scure/btc-signer'
import { hex } from '@scure/base'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { pubSchnorr } from '@scure/btc-signer/utils.js'

function decodePrivateKey(value) {
  const privateKey = String(value ?? '').trim()

  try {
    const bytes = hex.decode(privateKey)
    if (bytes.length !== 32) throw new Error('Wrong hex length')
    return bytes
  } catch {}

  try {
    return btc.WIF().decode(privateKey)
  } catch {}

  throw new Error('Invalid private key format: expected 32-byte hex or mainnet WIF')
}

export class StoreWallet {
  #p2wpkh
  #p2tr
  #privateKeyBytes

  static fromEnv(env, envKey = 'SELLING_WALLET_PRIVATE_KEY') {
    const privateKey = env[envKey]
    if (!privateKey) throw new Error(`Missing ${envKey}`)

    return new StoreWallet({ privateKey })
  }

  constructor({ privateKey }) {
    this.#privateKeyBytes = decodePrivateKey(privateKey)
    this.#p2wpkh = btc.p2wpkh(secp256k1.getPublicKey(this.#privateKeyBytes, true))
    this.#p2tr = btc.p2tr(pubSchnorr(this.#privateKeyBytes))
  }

  get nativeSegwitAddress() {
    return this.#p2wpkh.address
  }

  get taprootAddress() {
    return this.#p2tr.address
  }

  get fundingAddresses() {
    return [this.nativeSegwitAddress, this.taprootAddress]
  }

  get changeAddress() {
    return this.nativeSegwitAddress
  }

  get tapInternalKey() {
    return this.#p2tr.tapInternalKey
  }

  signTxInput(tx, inputIndex) {
    tx.signIdx(this.#privateKeyBytes, inputIndex)
  }
}
