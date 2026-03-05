import * as btc from '@scure/btc-signer'
import { base64, hex } from '@scure/base'

import { BuyPolicy } from '../../models/buy_policy.js'
import { createBuyOrder, getActiveBuyOrderForInscription } from '../../models/db/buy_orders.js'
import { OrdinalsAPI } from '../../models/ordinals_api.js'
import { StoreWallet } from '../../models/store_wallet.js'
import { buildGalleryIdSet, matchesInscriptionMetadata } from '../../models/policy_matcher.js'
import { Mempool } from '../../models/mempool.js'
import { safeErrorMessage } from '../../utils/logging.js'
import { estimateInputSize, estimateOutputSize } from '../../utils/tx_sizes.js'
import { isValidInscriptionId, normalizeBitcoinAddress } from '../../utils/validation.js'

const BASE_TX_SIZE = 10.5
const PADDING = 546n
const PREPARATION_TTL_MS = 60_000
const MAX_INSCRIPTION_AMOUNT = 10_000n
const FUNDING_WALLET_NAME = 'funding-wallet'
const FUNDING_INPUT_START_INDEX = 1

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

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID()

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hexString = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hexString.slice(0, 8)}-${hexString.slice(8, 12)}-${hexString.slice(12, 16)}-${hexString.slice(16, 20)}-${hexString.slice(20)}`
}

function amountToBigInt(value, label) {
  const amount = BigInt(value)
  if (amount < 0n) throw new Error(`Invalid ${label}`)
  return amount
}

function normalizeAddressOrThrow(value, label) {
  const normalized = normalizeBitcoinAddress(value)
  if (!normalized) throw new HttpError(400, `Invalid ${label}`)
  return normalized
}

function parsePsbt(signedPsbt) {
  try {
    return btc.Transaction.fromPSBT(base64.decode(signedPsbt))
  } catch {
    throw new HttpError(400, 'Invalid signedPsbt', 'invalid_psbt')
  }
}

function isTaprootAddress(address) {
  return String(address).startsWith('bc1p')
}

function parseTaprootPublicKey(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `Missing ${label}`)
  }

  try {
    const bytes = hex.decode(value.trim())
    if (bytes.length !== 32) throw new Error('Wrong length')
    return bytes
  } catch {
    throw new HttpError(400, `Invalid ${label}`)
  }
}

export class BuyPolicyWorker {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sql = state.storage.sql
    this.fundingWallet = StoreWallet.fromEnv(env, 'FUNDING_WALLET_PRIVATE_KEY')

    this.state.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS prepared_buys (
          trade_id TEXT PRIMARY KEY,
          inscription_id TEXT NOT NULL,
          reservation_id TEXT NOT NULL,
          details_json TEXT NOT NULL,
          expires_at_ms INTEGER NOT NULL,
          created_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_prepared_buys_inscription_id
          ON prepared_buys (inscription_id, expires_at_ms);
        CREATE INDEX IF NOT EXISTS idx_prepared_buys_expires_at
          ON prepared_buys (expires_at_ms);
      `)
    })
  }

  async fetch(request) {
    try {
      const url = new URL(request.url)
      this.#cleanupExpiredTrades(Date.now())

      if (request.method === 'POST' && url.pathname === '/prepare') {
        const result = await this.#prepareTrade(await request.json().catch(() => ({})))
        return json(result.data, result.status)
      }

      if (request.method === 'POST' && url.pathname === '/execute') {
        const result = await this.#executeTrade(await request.json().catch(() => ({})))
        return json(result.data, result.status)
      }

      throw new HttpError(404, 'Not found')
    } catch (error) {
      console.error(safeErrorMessage(error))
      if (error instanceof HttpError) {
        return json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, error.status)
      }
      return json({ error: error?.message ? String(error.message) : String(error) }, 500)
    }
  }

  async #prepareTrade({ collectionSlug, inscriptionId, sellerOrdinalAddress, sellerOrdinalPublicKey, sellerPaymentAddress }) {
    if (!collectionSlug) throw new HttpError(400, 'Missing collectionSlug')
    if (!isValidInscriptionId(inscriptionId)) throw new HttpError(400, 'Invalid inscriptionId')

    const policy = BuyPolicy.lookup(collectionSlug)
    const normalizedSellerOrdinalAddress = normalizeAddressOrThrow(sellerOrdinalAddress, 'sellerOrdinalAddress')
    const normalizedSellerPaymentAddress = normalizeAddressOrThrow(sellerPaymentAddress, 'sellerPaymentAddress')
    const sellerOrdinalTaprootKey = isTaprootAddress(normalizedSellerOrdinalAddress)
      ? parseTaprootPublicKey(sellerOrdinalPublicKey, 'sellerOrdinalPublicKey')
      : null

    const existing = await getActiveBuyOrderForInscription({ db: this.env.DB, inscriptionId })
    if (existing) throw new HttpError(409, 'Inscription already has an active buy', 'already_buying')

    const inscription = await this.#loadEligibleInscription({
      policy,
      inscriptionId,
      sellerOrdinalAddress: normalizedSellerOrdinalAddress
    })

    const feeRate = await this.#minimumFeeRate(policy)
    const fundingState = await this.#fundingRequest('/available', { forceRefresh: false })
    const quote = this.#selectFundingUtxos({
      fundingUtxos: fundingState.utxos,
      sellerOrdinalAddress: normalizedSellerOrdinalAddress,
      sellerPaymentAddress: normalizedSellerPaymentAddress,
      destinationAddress: policy.destinationAddress,
      priceSats: Number(policy.policy.price_sats),
      inscriptionValue: Number(inscription.value),
      feeRate
    })

    const reservationId = createId()
    await this.#fundingRequest('/reserve', {
      reservationId,
      outpoints: quote.selectedUtxos.map((utxo) => utxo.outpoint),
      ttlMs: PREPARATION_TTL_MS
    })

    let tradeId = null
    try {
      const tx = this.#buildUnsignedTransaction({
        quote,
        destinationAddress: policy.destinationAddress,
        sellerPaymentAddress: normalizedSellerPaymentAddress,
        sellerOrdinalAddress: normalizedSellerOrdinalAddress,
        sellerOrdinalTaprootKey,
        inscription
      })

      tradeId = createId()
      const now = Date.now()
      const details = {
        tradeId,
        collectionSlug,
        inscriptionId: inscription.id,
        reservationId,
        sellerOrdinalAddress: normalizedSellerOrdinalAddress,
        sellerPaymentAddress: normalizedSellerPaymentAddress,
        fundingAddresses: this.fundingWallet.fundingAddresses,
        changeAddress: quote.changeAddress,
        destinationAddress: policy.destinationAddress,
        fundingInputs: quote.selectedUtxos,
        feeRate,
        priceSats: Number(policy.policy.price_sats),
        networkFee: quote.networkFee,
        changeAmount: quote.changeAmount,
        inscriptionValue: Number(inscription.value),
        inscriptionOutputAmount: quote.inscriptionOutputAmount,
        inscriptionTxid: inscription.locationTxid,
        inscriptionVout: inscription.locationVout,
        createdAtMs: now,
        expiresAtMs: now + PREPARATION_TTL_MS
      }

      this.sql.exec(
        `INSERT INTO prepared_buys (
           trade_id,
           inscription_id,
           reservation_id,
           details_json,
           expires_at_ms,
           created_at_ms
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        tradeId,
        inscription.id,
        reservationId,
        JSON.stringify(details),
        details.expiresAtMs,
        now
      )

      return {
        status: 200,
        data: {
          tradeId,
          psbt: base64.encode(tx.toPSBT()),
          feeRate,
          networkFee: quote.networkFee,
          priceSats: Number(policy.policy.price_sats),
          inscription: {
            id: inscription.id,
            number: inscription.number,
            address: inscription.address,
            value: inscription.value
          }
        }
      }
    } catch (error) {
      await this.#fundingRequest('/release', { reservationId }).catch(() => {})
      throw error
    }
  }

  async #executeTrade({ tradeId, signedPsbt }) {
    if (typeof tradeId !== 'string' || tradeId.trim() === '') throw new HttpError(400, 'Missing tradeId')
    if (typeof signedPsbt !== 'string' || signedPsbt.trim() === '') throw new HttpError(400, 'Missing signedPsbt')

    const trade = this.sql
      .exec(
        `SELECT trade_id, reservation_id, details_json, expires_at_ms
         FROM prepared_buys
         WHERE trade_id = ?1
         LIMIT 1`,
        tradeId
      )
      .toArray()[0]

    if (!trade) throw new HttpError(404, 'Prepared trade not found', 'trade_missing')

    const details = JSON.parse(trade.details_json)
    const now = Date.now()
    if (Number(trade.expires_at_ms) <= now) {
      await this.#releaseTrade(trade)
      throw new HttpError(409, 'Prepared trade expired', 'trade_expired')
    }

    const policy = BuyPolicy.lookup(details.collectionSlug)
    const tx = parsePsbt(signedPsbt)

    try {
      const inscription = await this.#loadEligibleInscription({
        policy,
        inscriptionId: details.inscriptionId,
        sellerOrdinalAddress: details.sellerOrdinalAddress
      })

      const active = await getActiveBuyOrderForInscription({ db: this.env.DB, inscriptionId: details.inscriptionId })
      if (active) throw new HttpError(409, 'Inscription already has an active buy', 'already_buying')

      this.#validatePreparedTransaction({ tx, details, inscription })

      for (let index = 0; index < details.fundingInputs.length; index++) {
        const txIndex = FUNDING_INPUT_START_INDEX + index
        const fundingInput = details.fundingInputs[index]
        if (isTaprootAddress(fundingInput.address)) {
          tx.updateInput(txIndex, { tapInternalKey: this.fundingWallet.tapInternalKey })
        }
        this.fundingWallet.signTxInput(tx, txIndex)
      }

      tx.finalize()
      await this.#validateMempoolAcceptance({ tx, policy })

      const order = await createBuyOrder({
        db: this.env.DB,
        collectionSlug: details.collectionSlug,
        inscriptionId: details.inscriptionId,
        sellerOrdinalAddress: details.sellerOrdinalAddress,
        sellerPaymentAddress: details.sellerPaymentAddress,
        destinationAddress: details.destinationAddress,
        status: 'pending',
        txid: tx.id,
        signedTx: tx.hex,
        extraDetails: JSON.stringify({
          funding_inputs: details.fundingInputs,
          fee_rate: details.feeRate,
          network_fee: details.networkFee
        }),
        priceSats: details.priceSats
      })

      await this.#fundingRequest('/consume', {
        orderId: order.id,
        reservationId: trade.reservation_id,
        txid: tx.id,
        rawTxHex: tx.hex,
        collectionSlug: details.collectionSlug,
        inscriptionId: details.inscriptionId,
        spentOutpoints: details.fundingInputs.map((utxo) => utxo.outpoint)
      })

      this.sql.exec('DELETE FROM prepared_buys WHERE trade_id = ?1', tradeId)

      const result = { order, created: true }
      const broadcast = await Mempool.broadcastTx(tx.hex)
      if (broadcast !== true) {
        return { status: 200, data: { ...result, broadcastError: String(broadcast) } }
      }

      return { status: 200, data: result }
    } catch (error) {
      await this.#releaseTrade(trade)
      throw error
    }
  }

  async #loadEligibleInscription({ policy, inscriptionId, sellerOrdinalAddress }) {
    const ids = [inscriptionId]
    if (policy.policy.gallery_inscription_id) ids.push(policy.policy.gallery_inscription_id)

    const metadatas = await OrdinalsAPI.loadInscriptionsMetadata(ids)
    const metadataById = new Map(metadatas.map((metadata) => [metadata.id, metadata]))
    const metadata = metadataById.get(inscriptionId)
    if (!metadata) throw new HttpError(404, 'Inscription not found')

    const normalizedInscriptionAddress = normalizeBitcoinAddress(metadata.address)
    if (normalizedInscriptionAddress !== sellerOrdinalAddress) {
      throw new HttpError(400, 'Inscription is not owned by this wallet', 'wallet_mismatch')
    }

    const galleryMetadata = policy.policy.gallery_inscription_id ? metadataById.get(policy.policy.gallery_inscription_id) ?? null : null
    const galleryIds = galleryMetadata ? buildGalleryIdSet(galleryMetadata) : null
    const eligible = matchesInscriptionMetadata({ metadata, policy: policy.policy, galleryIds })
    if (!eligible) throw new HttpError(400, 'Inscription is not eligible for this buy policy', 'not_eligible')

    const [txid, vout] = String(metadata.satpoint ?? '').split(':')
    if (!txid || vout === undefined) throw new HttpError(400, 'Inscription is not available', 'invalid_satpoint')

    const outspend = await Mempool.txOutspend(txid, vout)
    if (outspend?.spent) throw new HttpError(400, 'Inscription is not available', 'inscription_spent')

    return {
      ...metadata,
      locationTxid: txid,
      locationVout: Number(vout),
      address: normalizedInscriptionAddress
    }
  }

  async #minimumFeeRate(policy) {
    if (policy.explicitFeeRate) return Number(policy.explicitFeeRate)
    const fees = await Mempool.feeEstimates()
    return Number(fees['2'])
  }

  #selectFundingUtxos({
    fundingUtxos,
    sellerOrdinalAddress,
    sellerPaymentAddress,
    destinationAddress,
    priceSats,
    inscriptionValue,
    feeRate
  }) {
    const available = Array.isArray(fundingUtxos) ? [...fundingUtxos] : []
    if (available.length === 0) throw new HttpError(409, 'Funding wallet is empty', 'funding_empty')

    let txSize = BASE_TX_SIZE
    txSize += estimateInputSize(sellerOrdinalAddress)
    txSize += estimateOutputSize(destinationAddress)
    txSize += estimateOutputSize(sellerPaymentAddress)

    const additionalPaddingSats = Math.max(0, 330 - inscriptionValue)
    const baseRequiredSats = priceSats + additionalPaddingSats

    const selectedUtxos = []
    let changeAddress = this.fundingWallet.changeAddress
    let inputValue = 0
    let networkFee = Math.ceil(txSize * feeRate)
    let satsRequired = baseRequiredSats + networkFee

    for (const utxo of available) {
      if (typeof utxo.address !== 'string' || utxo.address.trim() === '') continue

      selectedUtxos.push({
        outpoint: utxo.outpoint,
        txid: utxo.txid,
        vout: Number(utxo.vout),
        address: utxo.address,
        value: Number(utxo.value)
      })
      inputValue += Number(utxo.value)

      txSize += estimateInputSize(utxo.address)
      if (selectedUtxos.length === 1) {
        changeAddress = utxo.address
        txSize += estimateOutputSize(changeAddress)
      }
      networkFee = Math.ceil(txSize * feeRate)
      satsRequired = baseRequiredSats + networkFee

      if (inputValue >= satsRequired) break
    }

    if (inputValue < satsRequired) {
      throw new HttpError(409, 'Funding wallet balance is too low', 'funding_insufficient')
    }

    return {
      selectedUtxos,
      priceSats,
      networkFee,
      satsRequired,
      changeAmount: inputValue - satsRequired,
      changeAddress,
      inscriptionOutputAmount: Math.max(inscriptionValue, 330)
    }
  }

  #buildUnsignedTransaction({
    quote,
    destinationAddress,
    sellerPaymentAddress,
    sellerOrdinalAddress,
    sellerOrdinalTaprootKey,
    inscription
  }) {
    const tx = new btc.Transaction()

    const inscriptionInput = {
      txid: inscription.locationTxid,
      index: inscription.locationVout,
      sequence: 4294967293,
      witnessUtxo: {
        script: btc.OutScript.encode(btc.Address().decode(sellerOrdinalAddress)),
        amount: amountToBigInt(inscription.value, 'inscription value')
      }
    }

    if (sellerOrdinalTaprootKey) {
      inscriptionInput.tapInternalKey = sellerOrdinalTaprootKey
    }

    tx.addInput(inscriptionInput)

    for (const utxo of quote.selectedUtxos) {
      const input = {
        txid: utxo.txid,
        index: utxo.vout,
        sequence: 4294967293,
        witnessUtxo: {
          script: btc.OutScript.encode(btc.Address().decode(utxo.address)),
          amount: BigInt(utxo.value)
        }
      }

      if (isTaprootAddress(utxo.address)) {
        input.tapInternalKey = this.fundingWallet.tapInternalKey
      }

      tx.addInput(input)
    }

    tx.addOutputAddress(destinationAddress, BigInt(quote.inscriptionOutputAmount))
    tx.addOutputAddress(sellerPaymentAddress, BigInt(quote.priceSats ?? 0))

    if (quote.changeAmount >= Number(PADDING)) {
      tx.addOutputAddress(quote.changeAddress, BigInt(quote.changeAmount))
    }

    return tx
  }

  #validatePreparedTransaction({ tx, details, inscription }) {
    const expectedInputs = 1 + details.fundingInputs.length
    if (tx.inputsLength !== expectedInputs) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }

    const inscriptionInput = tx.getInput(0)
    if (!inscriptionInput) throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    if (hex.encode(inscriptionInput.txid) !== details.inscriptionTxid) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }
    if (inscriptionInput.index !== details.inscriptionVout) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }
    if (!inscriptionInput.witnessUtxo?.amount) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }
    if (Number(inscriptionInput.witnessUtxo.amount) !== Number(details.inscriptionValue)) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }
    if (inscriptionInput.witnessUtxo.amount > MAX_INSCRIPTION_AMOUNT) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'inscription_value_too_large')
    }

    const inscriptionInputAddress = btc.Address().encode(btc.OutScript.decode(inscriptionInput.witnessUtxo.script))
    if (inscriptionInputAddress !== details.sellerOrdinalAddress) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }

    if (String(inscription.id) !== String(details.inscriptionId)) {
      throw new HttpError(400, 'Inscription changed during preparation', 'inscription_changed')
    }

    for (let index = 0; index < details.fundingInputs.length; index++) {
      const input = tx.getInput(FUNDING_INPUT_START_INDEX + index)
      const expected = details.fundingInputs[index]
      if (!input) throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
      if (hex.encode(input.txid) !== expected.txid || input.index !== expected.vout) {
        throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
      }
      if (!input.witnessUtxo?.amount || Number(input.witnessUtxo.amount) !== Number(expected.value)) {
        throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
      }

      const fundingInputAddress = btc.Address().encode(btc.OutScript.decode(input.witnessUtxo.script))
      if (fundingInputAddress !== expected.address) {
        throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
      }
    }

    const inscriptionOutput = tx.getOutput(0)
    const paymentOutput = tx.getOutput(1)
    if (!inscriptionOutput || !paymentOutput) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }

    const inscriptionDestination = btc.Address().encode(btc.OutScript.decode(inscriptionOutput.script))
    if (inscriptionDestination !== details.destinationAddress) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }
    if (Number(inscriptionOutput.amount) !== Number(details.inscriptionOutputAmount)) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }

    const paymentDestination = btc.Address().encode(btc.OutScript.decode(paymentOutput.script))
    if (paymentDestination !== details.sellerPaymentAddress) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }
    if (Number(paymentOutput.amount) !== Number(details.priceSats)) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }

    const expectedOutputs = details.changeAmount >= Number(PADDING) ? 3 : 2
    if (tx.outputsLength !== expectedOutputs) {
      throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
    }

    if (expectedOutputs === 3) {
      const changeOutput = tx.getOutput(2)
      if (!changeOutput) throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
      const changeAddress = btc.Address().encode(btc.OutScript.decode(changeOutput.script))
      if (changeAddress !== details.changeAddress || Number(changeOutput.amount) !== Number(details.changeAmount)) {
        throw new HttpError(400, 'Transaction is not eligible for purchase', 'invalid_tx')
      }
    }
  }

  async #validateMempoolAcceptance({ tx, policy }) {
    const minFeeRateSatVb = await this.#minimumFeeRate(policy)
    const mempoolTest = await Mempool.txTest(tx.hex)

    if (!mempoolTest.allowed) {
      throw new HttpError(400, `Transaction rejected by mempool: ${mempoolTest.rejectReason ?? 'unknown'}`, 'mempool_reject')
    }
    if (!mempoolTest.effectiveFeeRateSatVb) {
      throw new HttpError(400, 'Unable to determine effective fee rate', 'fee_rate_missing')
    }
    if (Number(mempoolTest.effectiveFeeRateSatVb) < Number(minFeeRateSatVb)) {
      throw new HttpError(400, 'Fee rate too low, please prepare again', 'fee_too_low')
    }
  }

  async #fundingRequest(pathname, body = null) {
    const id = this.env.FUNDING_WALLET.idFromName(FUNDING_WALLET_NAME)
    const durableObject = this.env.FUNDING_WALLET.get(id)

    const response = await durableObject.fetch(`https://funding-wallet${pathname}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    })

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new HttpError(response.status, data?.error ? String(data.error) : 'Funding wallet request failed', data?.code ?? null)
    }

    return data
  }

  async #releaseTrade(trade) {
    this.sql.exec('DELETE FROM prepared_buys WHERE trade_id = ?1', trade.trade_id)
    await this.#fundingRequest('/release', { reservationId: trade.reservation_id }).catch(() => {})
  }

  #cleanupExpiredTrades(now) {
    const expired = this.sql
      .exec(
        `SELECT trade_id, reservation_id
         FROM prepared_buys
         WHERE expires_at_ms <= ?1`,
        now
      )
      .toArray()

    for (const trade of expired) {
      this.sql.exec('DELETE FROM prepared_buys WHERE trade_id = ?1', trade.trade_id)
      this.#fundingRequest('/release', { reservationId: trade.reservation_id }).catch(() => {})
    }
  }
}
