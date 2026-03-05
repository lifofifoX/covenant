import { withD1Retry } from './d1.js'

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function createId() {
  if (crypto.randomUUID) return crypto.randomUUID()

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function createBuyOrder({
  db,
  collectionSlug,
  inscriptionId,
  sellerOrdinalAddress,
  sellerPaymentAddress,
  destinationAddress,
  status,
  txid,
  signedTx,
  extraDetails,
  priceSats
}) {
  const timestampSeconds = nowSeconds()
  const id = createId()

  const statement = db.prepare(
    `INSERT INTO buy_orders (
      id,
      collection_slug,
      inscription_id,
      status,
      txid,
      signed_tx,
      extra_details,
      seller_ordinal_address,
      seller_payment_address,
      destination_address,
      price_sats,
      created_at,
      updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)`
  )

  await withD1Retry(() =>
    statement
      .bind(
        id,
        collectionSlug,
        inscriptionId,
        status,
        String(txid),
        String(signedTx),
        String(extraDetails),
        String(sellerOrdinalAddress),
        String(sellerPaymentAddress),
        String(destinationAddress),
        Number(priceSats),
        timestampSeconds
      )
      .run()
  )

  return getBuyOrderById({ db, id })
}

export async function getBuyOrderById({ db, id }) {
  const row = await withD1Retry(() => db.prepare('SELECT * FROM buy_orders WHERE id = ?1').bind(id).first())
  return row ?? null
}

export async function getActiveBuyOrderForInscription({ db, inscriptionId }) {
  const row = await withD1Retry(() =>
    db
      .prepare('SELECT * FROM buy_orders WHERE inscription_id = ?1 AND status IN (?2, ?3) ORDER BY created_at DESC LIMIT 1')
      .bind(inscriptionId, 'pending', 'confirmed')
      .first()
  )
  return row ?? null
}

export async function listPendingBuyOrders({ db, limit = 200, afterId = null }) {
  if (afterId == null) {
    const result = await withD1Retry(() =>
      db.prepare('SELECT * FROM buy_orders WHERE status = ?1 ORDER BY id ASC LIMIT ?2').bind('pending', limit).all()
    )
    return result.results ?? []
  }

  const result = await withD1Retry(() =>
    db
      .prepare('SELECT * FROM buy_orders WHERE status = ?1 AND id > ?2 ORDER BY id ASC LIMIT ?3')
      .bind('pending', String(afterId), limit)
      .all()
  )

  return result.results ?? []
}

export async function setBuyOrderStatus({ db, id, status, txid }) {
  const timestampSeconds = nowSeconds()
  await withD1Retry(() =>
    db
      .prepare('UPDATE buy_orders SET status = ?1, txid = COALESCE(?2, txid), updated_at = ?3 WHERE id = ?4')
      .bind(status, txid ?? null, timestampSeconds, id)
      .run()
  )

  return getBuyOrderById({ db, id })
}

export async function listBuyOrdersByCollection({ db, collectionSlug, limit = 10 }) {
  const result = await withD1Retry(() =>
    db
      .prepare(
        `SELECT * FROM buy_orders
         WHERE collection_slug = ?1 AND status IN ('pending', 'confirmed')
         ORDER BY created_at DESC
         LIMIT ?2`
      )
      .bind(collectionSlug, limit)
      .all()
  )

  return result.results ?? []
}

export async function listBuyOrders({ db, limit = 50 }) {
  const result = await withD1Retry(() => db.prepare('SELECT * FROM buy_orders ORDER BY created_at DESC LIMIT ?1').bind(limit).all())
  return result.results ?? []
}

export async function countConfirmedBuysByCollection({ db, collectionSlug }) {
  const result = await withD1Retry(() =>
    db.prepare('SELECT COUNT(*) as count FROM buy_orders WHERE collection_slug = ?1 AND status = ?2')
      .bind(collectionSlug, 'confirmed')
      .first()
  )

  return Number(result?.count ?? 0)
}
