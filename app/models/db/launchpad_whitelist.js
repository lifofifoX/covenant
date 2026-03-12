import { withD1Retry } from './d1.js'

export async function countLaunchpadWhitelistEntries({ db, collectionSlug }) {
  const row = await withD1Retry(() =>
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM launchpad_whitelist WHERE collection_slug = ?1`
      )
      .bind(collectionSlug)
      .first()
  )

  return Number(row?.count ?? 0)
}

export async function getLaunchpadWhitelistEntry({
  db,
  collectionSlug,
  addressNormalized,
}) {
  const row = await withD1Retry(() =>
    db
      .prepare(
        `SELECT collection_slug, address_normalized, max_mints, source_group
         FROM launchpad_whitelist
         WHERE collection_slug = ?1 AND address_normalized = ?2
         LIMIT 1`
      )
      .bind(collectionSlug, addressNormalized)
      .first()
  )

  return row ?? null
}