import { OrdinalsAPI } from '../models/ordinals_api.js'
import { Collection } from '../models/collection.js'
import { ensureInscriptionMetadata, refreshInscriptionMetadata, setCollectionAvailableIds } from '../models/db/inscriptions.js'
import { getSellerTaprootAddress } from '../utils/sell_address.js'

function uniq(arr) {
  return Array.from(new Set(arr))
}

function computeAvailableIds({ ownedIds, metadataById, collection }) {
  if (collection.inscription_ids) {
    const eligibleIds = uniq(collection.inscription_ids)
    return eligibleIds.filter((id) => ownedIds.includes(id))
  }

  if (collection.gallery_inscription_id) {
    const galleryMetadata = metadataById.get(collection.gallery_inscription_id)
    const gallery = galleryMetadata?.properties?.gallery ?? []
    const galleryIds = new Set(gallery.map((item) => item.id))

    const out = []

    for (const inscriptionId of ownedIds) {
      if (galleryIds.has(inscriptionId)) out.push(inscriptionId)
    }

    return uniq(out)
  }

  if (collection.parent_inscription_id) {
    const out = []

    for (const inscriptionId of ownedIds) {
      const metadata = metadataById.get(inscriptionId)
      if ((metadata.parents ?? []).includes(collection.parent_inscription_id)) out.push(inscriptionId)
    }

    return uniq(out)
  }

  return []
}

export async function syncCollections({ env }) {
  const db = env.DB
  const syncRunId = Math.floor(Date.now() / 1000)

  const taprootAddress = await getSellerTaprootAddress(env)
  const ownedIds = await OrdinalsAPI.findInscriptionsByAddress(taprootAddress)

  const collectionPolicies = Collection.listPolicies()
  const collectionSlugs = uniq(collectionPolicies.map((c) => c.slug))

  const metadataInscriptionIds = uniq(collectionPolicies.map((c) => new Collection({ policy: c }).metadataInscriptionId))
  await refreshInscriptionMetadata({ db, inscriptionIds: metadataInscriptionIds })

  const metadataById = await ensureInscriptionMetadata({ db, inscriptionIds: uniq([...metadataInscriptionIds, ...ownedIds]) })

  for (const collection of collectionPolicies) {
    const availableIds = computeAvailableIds({ ownedIds, metadataById, collection })
    await setCollectionAvailableIds({ db, collectionSlug: collection.slug, availableIds, syncRunId, metadataById })
  }

  if (collectionSlugs.length === 0) {
    await db.prepare('DELETE FROM collection_inscriptions').run()
    return
  }

  const placeholders = collectionSlugs.map((_, i) => `?${i + 1}`).join(', ')
  await db.prepare(`DELETE FROM collection_inscriptions WHERE collection_slug NOT IN (${placeholders})`).bind(...collectionSlugs).run()
}

export function runSyncCollectionsCron(event, env, ctx) {
  ctx.waitUntil(syncCollections({ env }))
}
