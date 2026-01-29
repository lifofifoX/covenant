import * as btc from '@scure/btc-signer'
import { getInputType, SigHash } from '@scure/btc-signer/transaction.js'

import { hex, base64 } from '@scure/base'

import { CONFIG } from '../../config.js'
import { Collection } from '../../models/collection.js'
import { createOrder, getActiveOrderForInscription } from '../../models/db/orders.js'
import { fetchJSON } from '../../utils/fetch_json.js'
import { safeErrorMessage } from '../../utils/logging.js'
import { StoreWallet } from '../../models/store_wallet.js'
import { Mempool } from '../../models/mempool.js'

class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message)

    this.status = status
    this.code = code
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const INSCRIPTION_INPUT_INDEX = 0
const INSCRIPTION_OUTPUT_INDEX = 0
const PAYMENT_OUTPUT_INDEX = 1
const MAX_INSCRIPTION_AMOUNT = 10000n

export class SigningAgentWorker {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.storeWallet = StoreWallet.fromEnv(env)
  }

  async fetch(request) {
    try {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/sell/address') {
        return json({ taprootAddress: this.storeWallet.taprootAddress }, 200)
      }

      if (!(request.method === 'POST' && url.pathname === '/sell')) throw new HttpError(404, 'Not found')

      const result = await this.#execute(await request.json())
      return json(result.data, result.status)
    } catch (error) {
      console.error(safeErrorMessage(error))
      if (error instanceof HttpError) {
        return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
      }
      return json({ error: error?.message ? String(error.message) : String(error) }, 500)
    }
  }

  async #execute(body) {
    const tx = this.#parseSignedPsbt(body.signedPsbt)
    const { collection, inscription } = await this.#findCollectionAndInscription(body)

    const existingOrder = await this.#findExistingActiveOrder(inscription.id)
    if (existingOrder) throw new HttpError(409, 'Inscription is already being sold', 'already_selling')

    this.#validateExpectedBuyerAddress(tx, body.expectedBuyerOrdinalAddress)
    await this.#validateEligibleUnsignedTransaction(tx, collection, inscription)
    await this.#validateEligibleInscription(inscription)

    tx.updateInput(INSCRIPTION_INPUT_INDEX, { tapInternalKey: this.storeWallet.tapInternalKey })
    this.storeWallet.signTxInput(tx, INSCRIPTION_INPUT_INDEX)
    tx.finalize()

    await this.#validateMempoolAcceptance(tx)

    const order = await createOrder({
      db: this.env.DB,
      collectionSlug: collection.slug,
      inscriptionId: inscription.id,
      buyerAddress: this.#findBuyerAddress(tx),
      status: 'pending',
      txid: tx.id,
      signedTx: tx.hex,
      extraDetails: JSON.stringify({ optional_payments: this.#findOptionalPayments(tx, collection) }),
      priceSats: Number(collection.policy.price_sats)
    })

    const result = { order, created: true }

    const broadcast = await Mempool.broadcastTx(tx.hex)
    if (broadcast !== true) return { status: 200, data: { ...result, broadcastError: String(broadcast) } }

    return { status: 200, data: result }
  }

  #parseSignedPsbt(signedPsbt) {
    try {
      return btc.Transaction.fromPSBT(base64.decode(signedPsbt))
    } catch {
      throw new HttpError(400, 'Invalid signedPsbt', 'invalid_psbt')
    }
  }

  async #findCollectionAndInscription({ collectionSlug, inscriptionId }) {
    if (!collectionSlug) throw new HttpError(400, 'Missing collectionSlug')
    if (!inscriptionId) throw new HttpError(400, 'Missing inscriptionId')

    const collection = Collection.lookup(collectionSlug)

    const inscription = await collection.loadInscription({ db: this.env.DB, inscriptionId })
    if (!inscription) throw new HttpError(404, 'Inscription not found')

    return { collection, inscription }
  }

  async #findExistingActiveOrder(inscriptionId) {
    const existing = await getActiveOrderForInscription({ db: this.env.DB, inscriptionId })
    if (existing) return existing
  }

  async #validateEligibleInscription(inscription) {
    const [txid, vout] = inscription.satpoint.split(':')
    if (!txid || !vout) throw new HttpError(400, 'Inscription is not available for sale')

    const [inscriptionJSON, outspend] = await Promise.all([
      fetchJSON(`${CONFIG.ord_api_url}/inscription/${inscription.id}`),
      Mempool.txOutspend(txid, vout)
    ])

    if (inscriptionJSON.satpoint !== inscription.satpoint) throw new HttpError(400, 'Inscription is not available for sale')
    if (inscriptionJSON.address !== this.storeWallet.taprootAddress) throw new HttpError(400, 'Inscription is not available for sale')
    if (outspend.spent) throw new HttpError(400, 'Inscription is not available for sale')
  }

  async #validateEligibleUnsignedTransaction(tx, collection, inscription) {
    const inscriptionInput = tx.getInput(INSCRIPTION_INPUT_INDEX)
    if (!inscriptionInput) throw new HttpError(400, 'Transaction is not eligible for sale')

    const inscriptionInputType = getInputType(inscriptionInput)
    if (inscriptionInputType.type !== 'tr') throw new HttpError(400, 'Transaction is not eligible for sale')
    if (inscriptionInputType.defaultSighash !== SigHash.DEFAULT) throw new HttpError(400, 'Transaction is not eligible for sale')
    if (inscriptionInputType.sighash !== SigHash.DEFAULT) throw new HttpError(400, 'Transaction is not eligible for sale')

    if (!inscriptionInput.witnessUtxo?.amount) throw new HttpError(400, 'Transaction is not eligible for sale')
    if (inscriptionInput.witnessUtxo.amount > MAX_INSCRIPTION_AMOUNT) throw new HttpError(400, 'Transaction is not eligible for sale')

    if (hex.encode(inscriptionInput.txid) !== inscription.locationTxid) throw new HttpError(400, 'Transaction is not eligible for sale')
    if (inscriptionInput.index !== inscription.locationVout) throw new HttpError(400, 'Transaction is not eligible for sale')

    const paymentOutput = tx.getOutput(PAYMENT_OUTPUT_INDEX)
    if (!paymentOutput) throw new HttpError(400, 'Transaction is not eligible for sale')

    if (paymentOutput.amount !== BigInt(collection.policy.price_sats)) throw new HttpError(400, 'Transaction is not eligible for sale')

    const paymentAddress = btc.Address().encode(btc.OutScript.decode(paymentOutput.script))
    if (paymentAddress !== collection.policy.payment_address) throw new HttpError(400, 'Transaction is not eligible for sale')
  }

  #validateExpectedBuyerAddress(tx, expectedBuyerOrdinalAddress) {
    if (!expectedBuyerOrdinalAddress) return

    const buyerAddress = this.#findBuyerAddress(tx)

    if (buyerAddress !== expectedBuyerOrdinalAddress) {
      throw new HttpError(400, 'Buyer address mismatch', 'buyer_mismatch')
    }
  }

  async #validateMempoolAcceptance(tx) {
    const [ feeEstimates, mempoolTest ] = await Promise.all([
      Mempool.feeEstimates(),
      Mempool.txTest(tx.hex)
    ])

    if (!mempoolTest.allowed) {
      throw new HttpError(400, `Transaction rejected by mempool: ${mempoolTest.rejectReason ?? 'unknown'}`, 'mempool_reject')
    }
    if (!mempoolTest.effectiveFeeRateSatVb) throw new HttpError(400, 'Unable to determine effective fee rate', 'fee_rate_missing')

    const minFeeRateSatVb = Number(feeEstimates['2'])

    if (Number(mempoolTest.effectiveFeeRateSatVb) < minFeeRateSatVb) {
      throw new HttpError(400, 'Fee rate too low, please prepare again', 'fee_too_low')
    }
  }

  #findBuyerAddress(tx) {
    const inscriptionOutput = tx.getOutput(INSCRIPTION_OUTPUT_INDEX)
    if (!inscriptionOutput) throw new Error('Inscription output not found')

    return btc.Address().encode(btc.OutScript.decode(inscriptionOutput.script))
  }

  #findOptionalPayments(tx, collection) {
    const optionalPayments = collection.optionalPayments()
    if (optionalPayments.length === 0) return []

    const selected = []

    for (let i = 0; i < tx.outputsLength; i++) {
      if (i === INSCRIPTION_OUTPUT_INDEX) continue
      if (i === PAYMENT_OUTPUT_INDEX) continue

      const output = tx.getOutput(i)
      const outputScript = btc.OutScript.decode(output.script)
      if (outputScript.type === 'unknown') continue

      const address = btc.Address().encode(outputScript)
      const match = optionalPayments.find((p) => p.address === address && Number(p.amount) === Number(output.amount))

      if (match) selected.push(match)
    }

    return selected
  }
}
