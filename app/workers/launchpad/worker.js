import { Collection } from '../../models/collection.js'
import { getAvailableInscriptionIds, getAvailableInscriptionMetadata } from '../../models/db/inscriptions.js'
import { safeErrorMessage } from '../../utils/logging.js'
import { normalizeOrdinalAddress } from '../../utils/validation.js'

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

const RESERVATION_TIMEOUT_MS = 30 * 1000
const RESERVATION_HISTORY_WINDOW_MS = 5 * 60 * 1000
const RESERVATION_CACHE_TTL_MS = 2000

class ReservationStore {
  constructor(sql) {
    this.sql = sql
  }

  findActiveByBuyer(buyerOrdinalAddress, now) {
    return this.sql.exec(
      `SELECT inscription_id, expires_at_ms
       FROM reservations
       WHERE buyer_ordinal_address = ?1
         AND expires_at_ms > ?2
       LIMIT 1`,
      buyerOrdinalAddress,
      now
    ).toArray()[0]
  }

  listState(now) {
    const cutoff = now - RESERVATION_HISTORY_WINDOW_MS

    const rows = this.sql
      .exec('SELECT inscription_id, expires_at_ms FROM reservations WHERE expires_at_ms >= ?1', cutoff)
      .toArray()

    const active = new Set()
    const all = new Set()

    for (const row of rows) {
      const inscriptionId = row.inscription_id
      all.add(inscriptionId)

      if (Number(row.expires_at_ms) > now) active.add(inscriptionId)
    }

    return { active, all }
  }

  reserve({ inscriptionId, buyerOrdinalAddress, expiresAt, now }) {
    this.sql.exec(
      `INSERT INTO reservations (inscription_id, buyer_ordinal_address, expires_at_ms)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(inscription_id) DO UPDATE
       SET buyer_ordinal_address = excluded.buyer_ordinal_address,
           expires_at_ms = excluded.expires_at_ms
       WHERE reservations.expires_at_ms <= ?4`,
      inscriptionId,
      buyerOrdinalAddress,
      expiresAt,
      now
    )
  }

  release(inscriptionId) {
    this.sql.exec('DELETE FROM reservations WHERE inscription_id = ?1', inscriptionId)
  }
}

class AvailableIdsCache {
  constructor({ db, ttlMs }) {
    this.db = db
    this.ttlMs = ttlMs
    this.ids = null
    this.expiresAt = 0
  }

  async load({ collectionSlug }) {
    const now = Date.now()
    if (this.ids && now < this.expiresAt) {
      return this.ids
    }

    this.ids = await getAvailableInscriptionIds({ db: this.db, collectionSlug })
    this.expiresAt = now + this.ttlMs
    return this.ids
  }

  remove(id) {
    if (!this.ids) return
    const index = this.ids.indexOf(id)
    if (index >= 0) this.ids.splice(index, 1)
  }
}

class ReservationAllocator {
  constructor({ state, reservations, cache, reservationTimeoutMs }) {
    this.state = state
    this.reservations = reservations
    this.cache = cache
    this.reservationTimeoutMs = reservationTimeoutMs
  }

  async reserve({ collectionSlug, buyerOrdinalAddress }) {
    const availableIds = await this.cache.load({ collectionSlug })
    if (availableIds.length === 0) return null

    return this.#attemptReserve({ availableIds, buyerOrdinalAddress })
  }

  // Keep synchronous: no awaits here so the reservation remains atomic within the DO.
  #attemptReserve({ availableIds, buyerOrdinalAddress }) {
    const now = Date.now()

    const active = this.reservations.findActiveByBuyer(buyerOrdinalAddress, now)
    if (active) return { inscriptionId: active.inscription_id, expiresAt: Number(active.expires_at_ms) }

    const { active: activeReserved, all: allReserved } = this.reservations.listState(now)
    const candidates = availableIds.filter((id) => !activeReserved.has(id))
    if (candidates.length === 0) return null

    const neverReserved = candidates.filter((id) => !allReserved.has(id))
    const preferred = neverReserved.length > 0 ? neverReserved : candidates
    const inscriptionId = preferred[Math.floor(Math.random() * preferred.length)]
    const expiresAt = now + this.reservationTimeoutMs

    this.reservations.reserve({ inscriptionId, buyerOrdinalAddress, expiresAt, now })
    this.cache.remove(inscriptionId)

    return { inscriptionId, expiresAt }
  }
}

export class LaunchpadReservationWorker {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.sql = state.storage.sql
    this.reservations = new ReservationStore(this.sql)
    this.availableIdsCache = new AvailableIdsCache({ db: this.env.DB, ttlMs: RESERVATION_CACHE_TTL_MS })

    this.reservationAllocator = new ReservationAllocator({
      state: this.state,
      reservations: this.reservations,
      cache: this.availableIdsCache,
      reservationTimeoutMs: RESERVATION_TIMEOUT_MS
    })

    this.state.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS reservations (
          inscription_id TEXT PRIMARY KEY,
          buyer_ordinal_address TEXT NOT NULL,
          expires_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reservations_expires_at
          ON reservations (expires_at_ms);
        CREATE INDEX IF NOT EXISTS idx_reservations_buyer_expires_at
          ON reservations (buyer_ordinal_address, expires_at_ms);

      `)
    })
  }

  async fetch(request) {
    try {
      const url = new URL(request.url)

      if (request.method === 'POST' && url.pathname === '/reserve') {
        const body = await request.json().catch(() => ({}))
        const result = await this.#handleReserve(body)
        return json(result.data, result.status)
      }

      if (request.method === 'POST' && url.pathname === '/mint') {
        const body = await request.json().catch(() => ({}))
        const result = await this.#handleMint(body)
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

  async #handleReserve({ collectionSlug, buyerOrdinalAddress }) {
    if (!collectionSlug) throw new HttpError(400, 'Missing collectionSlug')

    const normalizedBuyerOrdinalAddress = normalizeOrdinalAddress(buyerOrdinalAddress)
    if (!normalizedBuyerOrdinalAddress) throw new HttpError(400, 'Invalid buyerOrdinalAddress')

    const collection = Collection.lookup(collectionSlug)
    if (!collection.isLaunchpad) throw new HttpError(400, 'Collection is not a launchpad')

    const reservation = await this.reservationAllocator.reserve({
      collectionSlug,
      buyerOrdinalAddress: normalizedBuyerOrdinalAddress
    })
    if (!reservation) throw new HttpError(409, 'No inscriptions available', 'sold_out')

    const metadata = await this.#loadInscriptionMetadata(collectionSlug, reservation.inscriptionId)

    return {
      status: 200,
      data: {
        inscriptionId: reservation.inscriptionId,
        expiresAt: reservation.expiresAt,
        metadata
      }
    }
  }

  async #handleMint({ collectionSlug, inscriptionId, buyerOrdinalAddress, signedPsbt }) {
    if (!collectionSlug) throw new HttpError(400, 'Missing collectionSlug')
    if (!inscriptionId) throw new HttpError(400, 'Missing inscriptionId')

    const normalizedBuyerOrdinalAddress = normalizeOrdinalAddress(buyerOrdinalAddress)
    if (!normalizedBuyerOrdinalAddress) throw new HttpError(400, 'Invalid buyerOrdinalAddress')

    if (!signedPsbt) throw new HttpError(400, 'Missing signedPsbt')

    const collection = Collection.lookup(collectionSlug)
    if (!collection.isLaunchpad) throw new HttpError(400, 'Collection is not a launchpad')

    const reservation = this.sql.exec(
      'SELECT inscription_id, buyer_ordinal_address, expires_at_ms FROM reservations WHERE inscription_id = ?1',
      inscriptionId
    ).toArray()[0]

    if (!reservation) throw new HttpError(400, 'No reservation for this inscription', 'no_reservation')

    const reservationBuyer = reservation.buyer_ordinal_address
    if (reservationBuyer !== normalizedBuyerOrdinalAddress) {
      throw new HttpError(403, 'Reservation does not match buyer', 'reservation_mismatch')
    }

    const id = this.env.SIGNING_AGENT.idFromName(`${collectionSlug}:${inscriptionId}`)
    const durableObject = this.env.SIGNING_AGENT.get(id)

    const response = await durableObject.fetch('https://signing-agent/sell', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collectionSlug,
        inscriptionId,
        signedPsbt,
        expectedBuyerOrdinalAddress: reservationBuyer
      })
    })

    const data = await response.json().catch(() => ({}))

    if (response.ok) {
      this.sql.exec('DELETE FROM reservations WHERE inscription_id = ?1', inscriptionId)
    }

    return { status: response.status, data }
  }

  async #loadInscriptionMetadata(collectionSlug, inscriptionId) {
    try {
      const metadata = await getAvailableInscriptionMetadata({
        db: this.env.DB,
        collectionSlug,
        inscriptionId
      })
      if (!metadata) throw new HttpError(404, 'Inscription not found')

      return metadata
    } catch (error) {
      this.reservations.release(inscriptionId)
      throw error
    }
  }
}
