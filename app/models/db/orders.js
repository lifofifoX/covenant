import { withD1Retry } from './d1.js'
import { createId } from '../../utils/create_id.js'

export function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

export async function createOrder({ db, collectionSlug, inscriptionId, buyerAddress, status, txid, signedTx, extraDetails, priceSats }) {
  const timestampSeconds = nowSeconds()
  const id = createId()

  const statement = db.prepare(
    'INSERT INTO orders (id, collection_slug, inscription_id, status, txid, signed_tx, extra_details, buyer_address, price_sats, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)'
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
        String(buyerAddress),
        Number(priceSats),
        timestampSeconds
      )
      .run()
  )

  return await getOrderById({ db, id })
}

export async function getOrderById({ db, id }) {
  const row = await withD1Retry(() => db.prepare('SELECT * FROM orders WHERE id = ?1').bind(id).first())
  return row ?? null
}

export async function getActiveOrderForInscription({ db, inscriptionId }) {
  const row = await withD1Retry(() =>
    db
      .prepare('SELECT * FROM orders WHERE inscription_id = ?1 AND status IN (?2, ?3) ORDER BY created_at DESC LIMIT 1')
      .bind(inscriptionId, 'pending', 'confirmed')
      .first()
  )
  return row ?? null
}

export async function getActiveOrdersForInscriptions({ db, inscriptionIds }) {
  const ids = Array.isArray(inscriptionIds) ? inscriptionIds.filter(Boolean) : []
  if (ids.length === 0) return []

  const placeholders = ids.map((_, i) => `?${i + 1}`).join(', ')
  const query = `SELECT * FROM orders WHERE inscription_id IN (${placeholders}) AND status IN ('pending', 'confirmed') ORDER BY created_at DESC`
  const result = await withD1Retry(() => db.prepare(query).bind(...ids).all())
  return result.results ?? []
}

export async function listPendingOrders({ db, limit = 200, afterId = null }) {
  if (afterId == null) {
    const result = await withD1Retry(() =>
      db.prepare('SELECT * FROM orders WHERE status = ?1 ORDER BY id ASC LIMIT ?2').bind('pending', limit).all()
    )
    return result.results ?? []
  }

  const result = await withD1Retry(() =>
    db
      .prepare('SELECT * FROM orders WHERE status = ?1 AND id > ?2 ORDER BY id ASC LIMIT ?3')
      .bind('pending', String(afterId), limit)
      .all()
  )

  return result.results ?? []
}

export async function listOrders({ db, limit = 50 }) {
  const result = await withD1Retry(() => db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT ?1').bind(limit).all())
  return result.results ?? []
}

export async function setOrderStatus({ db, id, status, txid }) {
  const timestampSeconds = nowSeconds()
  await withD1Retry(() =>
    db
      .prepare('UPDATE orders SET status = ?1, txid = COALESCE(?2, txid), updated_at = ?3 WHERE id = ?4')
      .bind(status, txid ?? null, timestampSeconds, id)
      .run()
  )
  return await getOrderById({ db, id })
}

export async function countSoldByCollection({ db, collectionSlug }) {
  const result = await withD1Retry(() =>
    db.prepare('SELECT COUNT(*) as count FROM orders WHERE collection_slug = ?1 AND status = ?2')
      .bind(collectionSlug, 'confirmed')
      .first()
  )
  return result?.count ?? 0
}

export async function countPendingByCollection({ db, collectionSlug }) {
  const result = await withD1Retry(() =>
    db.prepare('SELECT COUNT(*) as count FROM orders WHERE collection_slug = ?1 AND status = ?2')
      .bind(collectionSlug, 'pending')
      .first()
  )
  return result?.count ?? 0
}

export async function listOrdersByCollection({ db, collectionSlug, limit = 10 }) {
  const result = await withD1Retry(() =>
    db.prepare(
      `SELECT * FROM orders
       WHERE collection_slug = ?1 AND status IN ('pending', 'confirmed')
       ORDER BY created_at DESC
       LIMIT ?2`
    )
      .bind(collectionSlug, limit)
      .all()
  )
  return result.results ?? []
}
