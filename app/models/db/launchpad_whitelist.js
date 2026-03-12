import { withD1Retry } from './d1.js'

export async function countLaunchpadWhitelistEntries({ db, collectionSlug }) {
  let row = null
  try {
    row = await withD1Retry(() =>
      db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM launchpad_whitelist
           WHERE collection_slug = ?1`
        )
        .bind(collectionSlug)
        .first()
    )
  } catch (error) {
    const message = error?.message ? String(error.message) : ''
    if (message.toLowerCase().includes('no such table: launchpad_whitelist')) {
      return 0
    }
    throw error
  }
  return Number(row?.count ?? 0)
}

export async function getLaunchpadWhitelistEntry({ db, collectionSlug, addressNormalized }) {
  let row = null
  try {
    row = await withD1Retry(() =>
      db
        .prepare(
          `SELECT collection_slug, address_normalized, max_mints, source_group
           FROM launchpad_whitelist
           WHERE collection_slug = ?1
             AND address_normalized = ?2
           LIMIT 1`
        )
        .bind(collectionSlug, addressNormalized)
        .first()
    )
  } catch (error) {
    const message = error?.message ? String(error.message) : ''
    if (message.toLowerCase().includes('no such table: launchpad_whitelist')) {
      return null
    }
    throw error
  }
  return row ?? null
}
