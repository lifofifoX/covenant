import * as btc from '@scure/btc-signer'
import { base64 } from '@scure/base'

import { createBuyOrder, listPendingBuyOrderFundingOutpoints } from '../../models/db/buy_orders.js'
import { Mempool } from '../../models/mempool.js'
import { StoreWallet } from '../../models/store_wallet.js'
import { safeErrorMessage } from '../../utils/logging.js'

const REFRESH_TTL_MS = 15_000
const EXECUTION_CLAIM_TTL_MS = 60_000
const PENDING_ORDER_SCAN_LIMIT = 5000

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

function outpointFor(utxo) {
  return `${utxo.txid}:${utxo.vout}`
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

function normalizeMinFeeRate(value) {
  const rate = Number(value)
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new HttpError(400, 'Invalid minFeeRateSatVb')
  }
  return rate
}

function isAlreadyBuyingError(error) {
  const message = error?.message ? String(error.message) : String(error)
  return (
    message.includes('idx_buy_orders_active_unique_inscription_id') ||
    (message.includes('buy_orders') && message.toLowerCase().includes('constraint'))
  )
}

export class FundingWalletWorker {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sql = state.storage.sql
    this.wallet = StoreWallet.fromEnv(env, 'FUNDING_WALLET_PRIVATE_KEY')

    this.state.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS funding_utxos (
          outpoint TEXT PRIMARY KEY,
          txid TEXT NOT NULL,
          vout INTEGER NOT NULL,
          address TEXT,
          value INTEGER NOT NULL,
          confirmed INTEGER NOT NULL,
          claim_id TEXT,
          claim_expires_at_ms INTEGER,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_funding_utxos_confirmed
          ON funding_utxos (confirmed, value DESC);
        CREATE INDEX IF NOT EXISTS idx_funding_utxos_claim
          ON funding_utxos (claim_id, claim_expires_at_ms);
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)

      try {
        this.sql.exec('ALTER TABLE funding_utxos ADD COLUMN address TEXT')
      } catch {}
      try {
        this.sql.exec('ALTER TABLE funding_utxos ADD COLUMN claim_id TEXT')
      } catch {}
      try {
        this.sql.exec('ALTER TABLE funding_utxos ADD COLUMN claim_expires_at_ms INTEGER')
      } catch {}
    })
  }

  async fetch(request) {
    try {
      const url = new URL(request.url)

      if (request.method === 'GET' && url.pathname === '/address') {
        return json({
          fundingAddress: this.wallet.changeAddress,
          fundingAddresses: this.wallet.fundingAddresses,
          nativeSegwitAddress: this.wallet.nativeSegwitAddress,
          taprootAddress: this.wallet.taprootAddress
        })
      }

      if (request.method === 'POST' && url.pathname === '/available') {
        const body = await request.json().catch(() => ({}))
        return json(await this.#handleAvailable({ forceRefresh: body.forceRefresh === true }))
      }

      if (request.method === 'POST' && url.pathname === '/commit') {
        const body = await request.json().catch(() => ({}))
        return json(await this.#handleCommit(body))
      }

      if (request.method === 'POST' && url.pathname === '/refresh') {
        return json(await this.#handleRefresh())
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

  async #handleAvailable({ forceRefresh = false } = {}) {
    const now = Date.now()
    await this.#maybeRefresh({ now, force: forceRefresh })
    this.#releaseExpiredClaims(now)

    const pendingOutpoints = await this.#pendingBuyOutpoints()
    const utxos = this.#availableRows().filter((row) => !pendingOutpoints.has(row.outpoint)).map((row) => ({
      outpoint: row.outpoint,
      txid: row.txid,
      vout: Number(row.vout),
      address: row.address,
      value: Number(row.value),
      confirmed: Boolean(row.confirmed)
    }))
    const totalAvailable = utxos.reduce((sum, utxo) => sum + utxo.value, 0)

    return {
      fundingAddress: this.wallet.changeAddress,
      fundingAddresses: this.wallet.fundingAddresses,
      utxos,
      totalAvailable
    }
  }

  async #handleCommit({ tradeId, signedPsbt, details, minFeeRateSatVb }) {
    if (typeof tradeId !== 'string' || tradeId.trim() === '') {
      throw new HttpError(400, 'Missing tradeId')
    }
    if (typeof signedPsbt !== 'string' || signedPsbt.trim() === '') {
      throw new HttpError(400, 'Missing signedPsbt')
    }
    if (!details || typeof details !== 'object' || Array.isArray(details)) {
      throw new HttpError(400, 'Missing details')
    }

    const claimId = tradeId.trim()
    const normalizedMinFeeRate = normalizeMinFeeRate(minFeeRateSatVb)
    const now = Date.now()

    await this.#maybeRefresh({ now, force: true })
    this.#releaseExpiredClaims(now)

    const pendingOutpoints = await this.#pendingBuyOutpoints()
    const fundingInputs = Array.isArray(details.fundingInputs) ? details.fundingInputs : []
    this.#claimFundingInputs({ claimId, fundingInputs, pendingOutpoints, now })

    try {
      const tx = parsePsbt(signedPsbt)

      for (let index = 0; index < fundingInputs.length; index++) {
        const txIndex = 1 + index
        const fundingInput = fundingInputs[index]
        if (isTaprootAddress(fundingInput.address)) {
          tx.updateInput(txIndex, { tapInternalKey: this.wallet.tapInternalKey })
        }
        this.wallet.signTxInput(tx, txIndex)
      }

      tx.finalize()
      await this.#validateMempoolAcceptance({ tx, minFeeRateSatVb: normalizedMinFeeRate })

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
          funding_inputs: fundingInputs,
          fee_rate: details.feeRate,
          network_fee: details.networkFee
        }),
        priceSats: details.priceSats
      })

      this.#releaseClaim(claimId)

      const result = { order, created: true }
      const broadcast = await Mempool.broadcastTx(tx.hex)
      if (broadcast !== true) {
        return { ...result, broadcastError: String(broadcast) }
      }

      return result
    } catch (error) {
      this.#releaseClaim(claimId)
      if (isAlreadyBuyingError(error)) {
        throw new HttpError(409, 'Inscription already has an active buy', 'already_buying')
      }
      throw error
    }
  }

  async #handleRefresh() {
    const now = Date.now()
    await this.#maybeRefresh({ now, force: true })
    this.#releaseExpiredClaims(now)

    const pendingOutpoints = await this.#pendingBuyOutpoints()
    const available = this.#availableRows().filter((row) => !pendingOutpoints.has(row.outpoint))
    return {
      refreshed: true,
      availableCount: available.length,
      totalAvailable: available.reduce((sum, row) => sum + Number(row.value), 0)
    }
  }

  async #maybeRefresh({ now, force }) {
    const lastRefreshMs = Number(this.#metadataValue('last_refresh_ms') ?? 0)
    const hasLegacyRows = this.sql.exec('SELECT 1 FROM funding_utxos WHERE address IS NULL LIMIT 1').toArray().length > 0
    if (!force && !hasLegacyRows && now - lastRefreshMs < REFRESH_TTL_MS) return

    const utxoResponses = await Promise.all(
      this.wallet.fundingAddresses.map(async (address) => ({
        address,
        utxos: await Mempool.addressUTXOs(address)
      }))
    )

    this.#syncUtxos({ utxoResponses, now })
    this.#setMetadataValue('last_refresh_ms', String(now))
  }

  #syncUtxos({ utxoResponses, now }) {
    const seenOutpoints = new Set()

    for (const { address, utxos } of utxoResponses) {
      for (const utxo of utxos) {
        const outpoint = outpointFor(utxo)
        seenOutpoints.add(outpoint)

        this.sql.exec(
          `INSERT INTO funding_utxos (
             outpoint,
             txid,
             vout,
             address,
             value,
             confirmed,
             updated_at_ms
           ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
           ON CONFLICT(outpoint) DO UPDATE
           SET txid = excluded.txid,
               vout = excluded.vout,
               address = excluded.address,
               value = excluded.value,
               confirmed = excluded.confirmed,
               updated_at_ms = excluded.updated_at_ms`,
          outpoint,
          utxo.txid,
          Number(utxo.vout),
          address,
          Number(utxo.value),
          utxo.status?.confirmed ? 1 : 0,
          now
        )
      }
    }

    const existing = this.sql.exec('SELECT outpoint FROM funding_utxos').toArray()
    for (const row of existing) {
      if (seenOutpoints.has(row.outpoint)) continue
      this.sql.exec('DELETE FROM funding_utxos WHERE outpoint = ?1', row.outpoint)
    }
  }

  #claimFundingInputs({ claimId, fundingInputs, pendingOutpoints, now }) {
    if (!Array.isArray(fundingInputs) || fundingInputs.length === 0) {
      throw new HttpError(400, 'Missing fundingInputs')
    }

    for (const expected of fundingInputs) {
      if (!expected?.outpoint || pendingOutpoints.has(expected.outpoint)) {
        throw new HttpError(409, 'Funding wallet changed, please prepare again', 'stale_quote')
      }

      const row = this.sql
        .exec(
          `SELECT outpoint, txid, vout, address, value, confirmed, claim_id, claim_expires_at_ms
           FROM funding_utxos
           WHERE outpoint = ?1
           LIMIT 1`,
          expected.outpoint
        )
        .toArray()[0]

      if (!row || Number(row.confirmed) !== 1) {
        throw new HttpError(409, 'Funding wallet changed, please prepare again', 'stale_quote')
      }

      const claimExpiresAtMs = Number(row.claim_expires_at_ms ?? 0)
      if (row.claim_id && row.claim_id !== claimId && claimExpiresAtMs > now) {
        throw new HttpError(409, 'Funding wallet changed, please prepare again', 'stale_quote')
      }

      if (
        String(row.txid) !== String(expected.txid) ||
        Number(row.vout) !== Number(expected.vout) ||
        String(row.address) !== String(expected.address) ||
        Number(row.value) !== Number(expected.value)
      ) {
        throw new HttpError(409, 'Funding wallet changed, please prepare again', 'stale_quote')
      }
    }

    const claimExpiresAtMs = now + EXECUTION_CLAIM_TTL_MS
    for (const expected of fundingInputs) {
      this.sql.exec(
        `UPDATE funding_utxos
         SET claim_id = ?1,
             claim_expires_at_ms = ?2,
             updated_at_ms = ?3
         WHERE outpoint = ?4`,
        claimId,
        claimExpiresAtMs,
        now,
        expected.outpoint
      )
    }
  }

  #releaseClaim(claimId) {
    this.sql.exec(
      `UPDATE funding_utxos
       SET claim_id = NULL,
           claim_expires_at_ms = NULL
       WHERE claim_id = ?1`,
      claimId
    )
  }

  #releaseExpiredClaims(now) {
    this.sql.exec(
      `UPDATE funding_utxos
       SET claim_id = NULL,
           claim_expires_at_ms = NULL
       WHERE claim_expires_at_ms IS NOT NULL
         AND claim_expires_at_ms <= ?1`,
      now
    )
  }

  #availableRows() {
    return this.sql
      .exec(
        `SELECT outpoint, txid, vout, address, value, confirmed
         FROM funding_utxos
         WHERE confirmed = 1
           AND claim_id IS NULL
         ORDER BY value DESC, outpoint ASC`
      )
      .toArray()
  }

  async #pendingBuyOutpoints() {
    const outpoints = await listPendingBuyOrderFundingOutpoints({
      db: this.env.DB,
      limit: PENDING_ORDER_SCAN_LIMIT
    })
    return new Set(outpoints)
  }

  async #validateMempoolAcceptance({ tx, minFeeRateSatVb }) {
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

  #metadataValue(key) {
    const row = this.sql.exec('SELECT value FROM metadata WHERE key = ?1 LIMIT 1', key).toArray()[0]
    return row?.value ?? null
  }

  #setMetadataValue(key, value) {
    this.sql.exec(
      `INSERT INTO metadata (key, value)
       VALUES (?1, ?2)
       ON CONFLICT(key) DO UPDATE
       SET value = excluded.value`,
      key,
      value
    )
  }
}
