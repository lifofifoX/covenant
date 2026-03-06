import { Mempool } from '../../models/mempool.js'
import { setBuyOrderStatus, setBuyOrderStatusByTxid } from '../../models/db/buy_orders.js'
import { StoreWallet } from '../../models/store_wallet.js'
import { safeErrorMessage } from '../../utils/logging.js'

const REFRESH_TTL_MS = 15_000
const DEFAULT_RESERVATION_TTL_MS = 60_000
const REBROADCAST_BACKOFF_MS = 30_000
const TRACKED_RECONCILIATION_LIMIT = 50

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

function normalizeReservationTtl(value) {
  const ttl = Number(value)
  if (!Number.isFinite(ttl) || ttl <= 0) return DEFAULT_RESERVATION_TTL_MS
  return Math.min(ttl, 5 * 60 * 1000)
}

function outpointFor(utxo) {
  return `${utxo.txid}:${utxo.vout}`
}

function statusCodeForBroadcastResult(result) {
  const match = String(result ?? '').match(/^HTTP\s+(\d{3})\b/)
  return match ? Number(match[1]) : null
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
          reserved_by TEXT,
          reserved_until_ms INTEGER,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_funding_utxos_confirmed
          ON funding_utxos (confirmed, value DESC);
        CREATE INDEX IF NOT EXISTS idx_funding_utxos_reserved
          ON funding_utxos (reserved_by, reserved_until_ms);
        CREATE TABLE IF NOT EXISTS tracked_transactions (
          txid TEXT PRIMARY KEY,
          order_id TEXT,
          raw_tx_hex TEXT NOT NULL,
          collection_slug TEXT,
          inscription_id TEXT,
          status TEXT NOT NULL,
          failure_reason TEXT,
          rebroadcast_count INTEGER NOT NULL DEFAULT 0,
          last_seen_at_ms INTEGER,
          last_broadcast_at_ms INTEGER,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `)

      try {
        this.sql.exec('ALTER TABLE funding_utxos ADD COLUMN address TEXT')
      } catch {}
      try {
        this.sql.exec('ALTER TABLE tracked_transactions ADD COLUMN order_id TEXT')
      } catch {}
      try {
        this.sql.exec('ALTER TABLE tracked_transactions ADD COLUMN failure_reason TEXT')
      } catch {}
      try {
        this.sql.exec('ALTER TABLE tracked_transactions ADD COLUMN rebroadcast_count INTEGER NOT NULL DEFAULT 0')
      } catch {}
      try {
        this.sql.exec('ALTER TABLE tracked_transactions ADD COLUMN last_seen_at_ms INTEGER')
      } catch {}
      try {
        this.sql.exec('ALTER TABLE tracked_transactions ADD COLUMN last_broadcast_at_ms INTEGER')
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

      if (request.method === 'POST' && url.pathname === '/reserve') {
        const body = await request.json().catch(() => ({}))
        return json(await this.#handleReserve(body))
      }

      if (request.method === 'POST' && url.pathname === '/release') {
        const body = await request.json().catch(() => ({}))
        return json(await this.#handleRelease(body))
      }

      if (request.method === 'POST' && url.pathname === '/consume') {
        const body = await request.json().catch(() => ({}))
        return json(await this.#handleConsume(body))
      }

      if (request.method === 'GET' && url.pathname.startsWith('/tracked/')) {
        const txid = decodeURIComponent(url.pathname.slice('/tracked/'.length))
        return json(await this.#handleTracked(txid))
      }

      if (request.method === 'POST' && url.pathname === '/broadcasted') {
        const body = await request.json().catch(() => ({}))
        return json(await this.#handleBroadcasted(body))
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
    this.#releaseExpiredReservations(now)

    const utxos = this.#availableRows(now).map((row) => ({
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
      totalAvailable,
      tracked: this.#trackedTransactions()
    }
  }

  async #handleReserve({ reservationId, outpoints, ttlMs }) {
    if (typeof reservationId !== 'string' || reservationId.trim() === '') {
      throw new HttpError(400, 'Missing reservationId')
    }

    const requestedOutpoints = Array.isArray(outpoints) ? [...new Set(outpoints.filter(Boolean))] : []
    if (requestedOutpoints.length === 0) {
      throw new HttpError(400, 'Missing outpoints')
    }

    const now = Date.now()
    await this.#maybeRefresh({ now, force: false })
    this.#releaseExpiredReservations(now)

    const selected = []
    for (const outpoint of requestedOutpoints) {
      const row = this.sql
        .exec(
          `SELECT outpoint, txid, vout, value, confirmed, reserved_by, reserved_until_ms
           FROM funding_utxos
           WHERE outpoint = ?1
           LIMIT 1`,
          outpoint
        )
        .toArray()[0]

      if (!row || Number(row.confirmed) !== 1) {
        throw new HttpError(409, 'Funding UTXO is no longer available', 'utxo_unavailable')
      }

      const reservedUntil = Number(row.reserved_until_ms ?? 0)
      if (row.reserved_by && reservedUntil > now && row.reserved_by !== reservationId) {
        throw new HttpError(409, 'Funding UTXO is already reserved', 'utxo_reserved')
      }

      selected.push({
        outpoint: row.outpoint,
        txid: row.txid,
        vout: Number(row.vout),
        value: Number(row.value)
      })
    }

    const expiresAt = now + normalizeReservationTtl(ttlMs)
    for (const outpoint of requestedOutpoints) {
      this.sql.exec(
        `UPDATE funding_utxos
         SET reserved_by = ?1,
             reserved_until_ms = ?2,
             updated_at_ms = ?3
         WHERE outpoint = ?4`,
        reservationId,
        expiresAt,
        now,
        outpoint
      )
    }

    return { reservationId, expiresAt, utxos: selected }
  }

  async #handleRelease({ reservationId }) {
    if (typeof reservationId !== 'string' || reservationId.trim() === '') {
      throw new HttpError(400, 'Missing reservationId')
    }

    this.sql.exec(
      `UPDATE funding_utxos
       SET reserved_by = NULL,
           reserved_until_ms = NULL
       WHERE reserved_by = ?1`,
      reservationId
    )

    return { released: true, reservationId }
  }

  async #handleConsume({ orderId = null, reservationId, txid, rawTxHex, collectionSlug = null, inscriptionId = null, spentOutpoints = [] }) {
    if (typeof reservationId !== 'string' || reservationId.trim() === '') {
      throw new HttpError(400, 'Missing reservationId')
    }
    if (typeof txid !== 'string' || txid.trim() === '') {
      throw new HttpError(400, 'Missing txid')
    }
    if (typeof rawTxHex !== 'string' || rawTxHex.trim() === '') {
      throw new HttpError(400, 'Missing rawTxHex')
    }

    const now = Date.now()
    const outpoints = Array.isArray(spentOutpoints) ? [...new Set(spentOutpoints.filter(Boolean))] : []

    for (const outpoint of outpoints) {
      this.sql.exec('DELETE FROM funding_utxos WHERE outpoint = ?1', outpoint)
    }

    this.sql.exec(
      `UPDATE funding_utxos
       SET reserved_by = NULL,
           reserved_until_ms = NULL,
           updated_at_ms = ?2
       WHERE reserved_by = ?1`,
      reservationId,
      now
    )

    this.sql.exec(
      `INSERT INTO tracked_transactions (
         txid,
         order_id,
         raw_tx_hex,
         collection_slug,
         inscription_id,
         status,
         failure_reason,
       rebroadcast_count,
       last_seen_at_ms,
       last_broadcast_at_ms,
       created_at_ms,
       updated_at_ms
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, 0, NULL, NULL, ?7, ?7)
      ON CONFLICT(txid) DO UPDATE
      SET order_id = excluded.order_id,
          raw_tx_hex = excluded.raw_tx_hex,
          collection_slug = excluded.collection_slug,
          inscription_id = excluded.inscription_id,
          status = excluded.status,
          failure_reason = excluded.failure_reason,
          rebroadcast_count = excluded.rebroadcast_count,
          last_seen_at_ms = excluded.last_seen_at_ms,
          last_broadcast_at_ms = COALESCE(tracked_transactions.last_broadcast_at_ms, excluded.last_broadcast_at_ms),
          updated_at_ms = excluded.updated_at_ms`,
      txid,
      typeof orderId === 'string' && orderId.trim() !== '' ? orderId.trim() : null,
      rawTxHex,
      collectionSlug,
      inscriptionId,
      'pending',
      now
    )

    return { tracked: true, txid }
  }

  async #handleTracked(txid) {
    if (typeof txid !== 'string' || txid.trim() === '') {
      throw new HttpError(400, 'Missing txid')
    }

    const row = this.sql
      .exec(
        `SELECT txid,
                order_id,
                collection_slug,
                inscription_id,
                status,
                failure_reason,
                rebroadcast_count,
                last_seen_at_ms,
                last_broadcast_at_ms,
                created_at_ms,
                updated_at_ms
         FROM tracked_transactions
         WHERE txid = ?1
         LIMIT 1`,
        txid.trim()
      )
      .toArray()[0]

    if (!row) throw new HttpError(404, 'Tracked transaction not found', 'tracked_missing')

    return { tracked: true, transaction: row }
  }

  async #handleBroadcasted({ txid }) {
    if (typeof txid !== 'string' || txid.trim() === '') {
      throw new HttpError(400, 'Missing txid')
    }

    const now = Date.now()
    const row = this.sql.exec('SELECT txid FROM tracked_transactions WHERE txid = ?1 LIMIT 1', txid.trim()).toArray()[0]
    if (!row) throw new HttpError(404, 'Tracked transaction not found', 'tracked_missing')

    this.sql.exec(
      `UPDATE tracked_transactions
       SET status = CASE WHEN status = 'confirmed' THEN status ELSE 'pending' END,
           failure_reason = NULL,
           last_broadcast_at_ms = ?2,
           updated_at_ms = ?2
       WHERE txid = ?1`,
      txid.trim(),
      now
    )

    return { tracked: true, txid: txid.trim(), broadcasted: true }
  }

  async #handleRefresh() {
    const now = Date.now()
    await this.#maybeRefresh({ now, force: true })

    const available = this.#availableRows(now)
    return {
      refreshed: true,
      availableCount: available.length,
      totalAvailable: available.reduce((sum, row) => sum + Number(row.value), 0),
      tracked: this.#trackedTransactions()
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
    await this.#reconcileTrackedTransactions(now)
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

    this.#releaseExpiredReservations(now)
  }

  async #reconcileTrackedTransactions(now) {
    const tracked = this.sql
      .exec(
        `SELECT txid,
                order_id,
                raw_tx_hex,
                collection_slug,
                inscription_id,
                status,
                failure_reason,
                rebroadcast_count,
                last_seen_at_ms,
                last_broadcast_at_ms,
                created_at_ms,
                updated_at_ms
         FROM tracked_transactions
         WHERE status IN ('pending', 'dropped')
         ORDER BY updated_at_ms ASC
         LIMIT ?1`,
        TRACKED_RECONCILIATION_LIMIT
      )
      .toArray()

    for (const row of tracked) {
      try {
        const tx = await Mempool.tx(row.txid)
        if (tx?.status?.confirmed) {
          await this.#markTrackedTransactionConfirmed(row, now)
          continue
        }

        if (tx) {
          row.status = 'pending'
          row.failure_reason = null
          row.last_seen_at_ms = now
          row.updated_at_ms = now
          this.#writeTrackedTransaction(row)
          continue
        }

        row.status = 'dropped'
        row.failure_reason = 'tx_not_found'
        row.updated_at_ms = now
        this.#writeTrackedTransaction(row)

        const lastBroadcastAtMs = Number(row.last_broadcast_at_ms ?? 0)
        if (lastBroadcastAtMs > 0 && now - lastBroadcastAtMs < REBROADCAST_BACKOFF_MS) continue

        const broadcastResult = await Mempool.broadcastTx(row.raw_tx_hex)
        if (broadcastResult === true) {
          row.status = 'pending'
          row.failure_reason = null
          row.rebroadcast_count = Number(row.rebroadcast_count ?? 0) + 1
          row.last_broadcast_at_ms = now
          row.updated_at_ms = now
          this.#writeTrackedTransaction(row)
          continue
        }

        const failureReason = String(broadcastResult ?? 'Broadcast failed')
        if (statusCodeForBroadcastResult(failureReason) === 400) {
          await this.#markTrackedTransactionFailed(row, now, failureReason)
          continue
        }

        row.failure_reason = failureReason
        row.updated_at_ms = now
        this.#writeTrackedTransaction(row)
      } catch (error) {
        row.failure_reason = safeErrorMessage(error)
        row.updated_at_ms = now
        this.#writeTrackedTransaction(row)
      }
    }
  }

  #availableRows(now) {
    return this.sql
      .exec(
        `SELECT outpoint, txid, vout, address, value, confirmed
         FROM funding_utxos
         WHERE confirmed = 1
           AND (reserved_until_ms IS NULL OR reserved_until_ms <= ?1)
         ORDER BY value DESC, outpoint ASC`,
        now
      )
      .toArray()
  }

  #trackedTransactions() {
    return this.sql
      .exec(
        `SELECT txid,
                order_id,
                collection_slug,
                inscription_id,
                status,
                failure_reason,
                rebroadcast_count,
                last_seen_at_ms,
                last_broadcast_at_ms,
                created_at_ms,
                updated_at_ms
         FROM tracked_transactions
         ORDER BY created_at_ms DESC
         LIMIT 20`
      )
      .toArray()
  }

  #writeTrackedTransaction(row) {
    this.sql.exec(
      `UPDATE tracked_transactions
       SET order_id = ?2,
           raw_tx_hex = ?3,
           collection_slug = ?4,
           inscription_id = ?5,
           status = ?6,
           failure_reason = ?7,
           rebroadcast_count = ?8,
           last_seen_at_ms = ?9,
           last_broadcast_at_ms = ?10,
           updated_at_ms = ?11
       WHERE txid = ?1`,
      row.txid,
      row.order_id ?? null,
      row.raw_tx_hex,
      row.collection_slug ?? null,
      row.inscription_id ?? null,
      row.status,
      row.failure_reason ?? null,
      Number(row.rebroadcast_count ?? 0),
      row.last_seen_at_ms ?? null,
      row.last_broadcast_at_ms ?? null,
      Number(row.updated_at_ms ?? Date.now())
    )
  }

  async #markTrackedTransactionConfirmed(row, now) {
    await this.#syncBuyOrderStatus(row, 'confirmed')
    row.status = 'confirmed'
    row.failure_reason = null
    row.last_seen_at_ms = now
    row.updated_at_ms = now
    this.#writeTrackedTransaction(row)
  }

  async #markTrackedTransactionFailed(row, now, failureReason) {
    await this.#syncBuyOrderStatus(row, 'failed')
    row.status = 'failed'
    row.failure_reason = failureReason
    row.updated_at_ms = now
    this.#writeTrackedTransaction(row)
  }

  async #syncBuyOrderStatus(row, status) {
    if (row.order_id) {
      const order = await setBuyOrderStatus({ db: this.env.DB, id: row.order_id, status, txid: row.txid })
      if (!order) throw new Error(`Buy order not found for tracked transaction ${row.txid}`)
      return
    }

    const order = await setBuyOrderStatusByTxid({ db: this.env.DB, txid: row.txid, status })
    if (!order) throw new Error(`Buy order not found for tracked transaction ${row.txid}`)
  }

  #releaseExpiredReservations(now) {
    this.sql.exec(
      `UPDATE funding_utxos
       SET reserved_by = NULL,
           reserved_until_ms = NULL,
           updated_at_ms = ?1
       WHERE reserved_until_ms IS NOT NULL
         AND reserved_until_ms <= ?1`,
      now
    )
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
