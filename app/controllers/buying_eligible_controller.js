import { BuyPolicy } from '../models/buy_policy.js'
import { OrdinalsAPI } from '../models/ordinals_api.js'
import { buildGalleryIdSet, matchesInscriptionMetadata } from '../models/policy_matcher.js'
import { Inscription } from '../models/inscription.js'
import { normalizeBitcoinAddress } from '../utils/validation.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

function serializeMetadata(metadata) {
  const inscription = new Inscription({ metadata })
  return {
    id: metadata.id,
    number: metadata.number,
    title: inscription.title,
    contentUrl: inscription.contentUrl,
    previewUrl: inscription.previewUrl,
    isImage: inscription.isImage,
    address: metadata.address,
    value: metadata.value,
    satpoint: metadata.satpoint
  }
}

export async function buyingEligibleController(c) {
  const slug = c.req.param('slug')
  const ordinalAddress = normalizeBitcoinAddress(c.req.query('ordinalAddress'))

  if (!ordinalAddress) {
    return json({ error: 'Invalid ordinalAddress' }, 400)
  }

  let policy
  try {
    policy = BuyPolicy.lookup(slug)
  } catch {
    return json({ error: 'Not found' }, 404)
  }

  const ownedIds = await OrdinalsAPI.findInscriptionsByAddress(ordinalAddress)
  if (ownedIds.length === 0) return json({ inscriptions: [] })

  const lookupIds = [...ownedIds]
  if (policy.policy.gallery_inscription_id) lookupIds.push(policy.policy.gallery_inscription_id)

  const metadataList = await OrdinalsAPI.loadInscriptionsMetadata(Array.from(new Set(lookupIds)))
  const metadataById = new Map(metadataList.map((metadata) => [metadata.id, metadata]))
  const galleryMetadata = policy.policy.gallery_inscription_id ? metadataById.get(policy.policy.gallery_inscription_id) ?? null : null
  const galleryIds = galleryMetadata ? buildGalleryIdSet(galleryMetadata) : null

  const inscriptions = ownedIds
    .map((id) => metadataById.get(id))
    .filter(Boolean)
    .filter((metadata) => matchesInscriptionMetadata({ metadata, policy: policy.policy, galleryIds }))
    .sort((left, right) => Number(right.number ?? 0) - Number(left.number ?? 0))
    .map(serializeMetadata)

  return json({ inscriptions })
}
