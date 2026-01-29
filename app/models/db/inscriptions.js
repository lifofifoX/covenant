import { OrdinalsAPI } from '../ordinals_api.js'
import { withD1Retry } from './d1.js'

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function getInscriptionMetadata({ db, inscriptionId }) {
  const row = await withD1Retry(() =>
    db
      .prepare('SELECT metadata_json FROM inscription_metadata WHERE inscription_id = ?1')
      .bind(inscriptionId)
      .first()
  )

  if (row?.metadata_json) return JSON.parse(row.metadata_json)
}

export async function refreshInscriptionMetadata({ db, inscriptionIds }) {
  if (inscriptionIds.length === 0) return

  const timestamp = nowSeconds()

  for (const batch of chunk(inscriptionIds, 100)) {
    const batchedMetadata = await OrdinalsAPI.loadInscriptionsMetadata(batch)
    const statements = []

    for (const metadata of batchedMetadata) {
      statements.push(
        db
          .prepare(
            'INSERT INTO inscription_metadata (inscription_id, metadata_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(inscription_id) DO UPDATE SET metadata_json = excluded.metadata_json, updated_at = excluded.updated_at'
          )
          .bind(metadata.id, JSON.stringify(metadata), timestamp)
      )
    }

    if (statements.length) await withD1Retry(() => db.batch(statements))
  }
}

export async function ensureInscriptionMetadata({ db, inscriptionIds }) {
  if (inscriptionIds.length === 0) return new Map()

  const existing = new Set()

  for (const batch of chunk(inscriptionIds, 100)) {
    const placeholders = batch.map((_, i) => `?${i + 1}`).join(', ')

    const rows = await db
      .prepare(`SELECT inscription_id FROM inscription_metadata WHERE inscription_id IN (${placeholders})`)
      .bind(...batch)
      .all()

    for (const r of rows.results) existing.add(r.inscription_id)
  }

  const missing = inscriptionIds.filter((id) => !existing.has(id))
  const timestamp = nowSeconds()

  for (const batch of chunk(missing, 100)) {
    const batchedMetadata = await OrdinalsAPI.loadInscriptionsMetadata(batch)
    const statements = []

    for (const metadata of batchedMetadata) {
      statements.push(
        db
          .prepare(
            'INSERT INTO inscription_metadata (inscription_id, metadata_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(inscription_id) DO UPDATE SET metadata_json = excluded.metadata_json, updated_at = excluded.updated_at'
          )
          .bind(metadata.id, JSON.stringify(metadata), timestamp)
      )
    }

    if (statements.length) await withD1Retry(() => db.batch(statements))
  }

  const out = new Map()

  for (const batch of chunk(inscriptionIds, 100)) {
    const placeholders = batch.map((_, i) => `?${i + 1}`).join(', ')

    const rows = await db
      .prepare(`SELECT inscription_id, metadata_json FROM inscription_metadata WHERE inscription_id IN (${placeholders})`)
      .bind(...batch)
      .all()

    for (const r of rows.results) {
      out.set(r.inscription_id, JSON.parse(r.metadata_json))
    }
  }

  return out
}

export async function setCollectionAvailableIds({ db, collectionSlug, availableIds, syncRunId, metadataById }) {
  const runId = Number(syncRunId)
  const timestamp = nowSeconds()

  for (const batch of chunk(availableIds, 100)) {
    const statements = []

    for (const inscriptionId of batch) {
      statements.push(
        db
          .prepare(
            'INSERT INTO collection_inscriptions (collection_slug, inscription_id, sync_run_id, updated_at, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(collection_slug, inscription_id) DO UPDATE SET sync_run_id = excluded.sync_run_id, updated_at = excluded.updated_at, metadata_json = excluded.metadata_json'
          )
          .bind(collectionSlug, inscriptionId, runId, timestamp, JSON.stringify(metadataById.get(inscriptionId)))
      )
    }
    if (statements.length) await withD1Retry(() => db.batch(statements))
  }

  await withD1Retry(() =>
    db.prepare('DELETE FROM collection_inscriptions WHERE collection_slug = ?1 AND sync_run_id != ?2').bind(collectionSlug, runId).run()
  )
}

export async function countCollectionAvailable({ db, collectionSlug }) {
  const row = await withD1Retry(() =>
    db.prepare('SELECT COUNT(1) as count FROM collection_inscriptions WHERE collection_slug = ?1').bind(collectionSlug).first()
  )
  return Number(row.count)
}

export async function countCollectionTotal({ db, collectionSlug }) {
  const result = await withD1Retry(() =>
    db.prepare('SELECT COUNT(*) as count FROM collection_inscriptions WHERE collection_slug = ?1')
      .bind(collectionSlug)
      .first()
  )
  return result?.count ?? 0
}

export async function listCollectionAvailablePage({ db, collectionSlug, limit, offset }) {
  const result = await withD1Retry(() =>
    db
      .prepare(
        'SELECT metadata_json FROM collection_inscriptions WHERE collection_slug = ?1 ORDER BY inscription_id ASC LIMIT ?2 OFFSET ?3'
      )
      .bind(collectionSlug, Number(limit), Number(offset))
      .all()
  )

  return result.results.map((r) => JSON.parse(r.metadata_json))
}

export async function getAvailableInscriptionMetadata({ db, collectionSlug, inscriptionId }) {
  const row = await withD1Retry(() =>
    db
      .prepare(
        'SELECT metadata_json FROM collection_inscriptions WHERE collection_slug = ?1 AND inscription_id = ?2 LIMIT 1'
      )
      .bind(collectionSlug, inscriptionId)
      .first()
  )

  if (!row?.metadata_json) return null
  return JSON.parse(row.metadata_json)
}

export async function getAvailableInscriptionIds({ db, collectionSlug }) {
  return withD1Retry(async () => {
    const result = await db.prepare(`
      SELECT ci.inscription_id
      FROM collection_inscriptions ci
      LEFT JOIN orders o ON ci.inscription_id = o.inscription_id
        AND o.status IN ('pending', 'confirmed')
      WHERE ci.collection_slug = ?
        AND o.id IS NULL
    `).bind(collectionSlug).all()

    return result.results.map(row => row.inscription_id)
  })
}
