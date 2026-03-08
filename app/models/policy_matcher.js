function uniq(values) {
  return Array.from(new Set(values))
}

export function resolveMetadataInscriptionId(policy) {
  const id = policy.gallery_inscription_id ?? policy.parent_inscription_id ?? policy.inscription_ids?.[0]
  if (!id) throw new Error(`Missing metadata inscription id for policy: ${policy.slug ?? 'unknown'}`)
  return id
}

export function buildGalleryIdSet(galleryMetadata) {
  const gallery = galleryMetadata?.properties?.gallery ?? []
  return new Set(gallery.map((item) => item.id))
}

export function matchesInscriptionMetadata({ metadata, policy, galleryIds = null }) {
  if (!metadata) return false

  if (Array.isArray(policy.inscription_ids) && policy.inscription_ids.length > 0) {
    return policy.inscription_ids.includes(metadata.id)
  }

  if (policy.gallery_inscription_id) {
    const galleryIdSet = galleryIds ?? buildGalleryIdSet(null)
    return galleryIdSet.has(metadata.id)
  }

  if (policy.parent_inscription_id) {
    return (metadata.parents ?? []).includes(policy.parent_inscription_id)
  }

  return false
}

export function filterEligibleInscriptionIds({ ownedIds, metadataById, policy, galleryMetadata = null }) {
  if (Array.isArray(policy.inscription_ids) && policy.inscription_ids.length > 0) {
    const eligibleIds = uniq(policy.inscription_ids)
    return eligibleIds.filter((id) => ownedIds.includes(id))
  }

  if (policy.gallery_inscription_id) {
    const galleryIds = buildGalleryIdSet(galleryMetadata)
    return uniq(ownedIds.filter((id) => galleryIds.has(id)))
  }

  if (policy.parent_inscription_id) {
    return uniq(
      ownedIds.filter((id) => {
        const metadata = metadataById.get(id)
        return (metadata?.parents ?? []).includes(policy.parent_inscription_id)
      })
    )
  }

  return []
}
