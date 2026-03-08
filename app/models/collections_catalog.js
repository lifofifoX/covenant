import catalogJson from '../../config/collections.json'

const CATALOG = Array.isArray(catalogJson) ? catalogJson : []

function normalizeReferenceIds(entry) {
  const ids = Array.isArray(entry.ids) ? entry.ids : []
  const legacyId = typeof entry.id === 'string' && entry.id.trim() !== '' ? [entry.id] : []
  return [...ids, ...legacyId]
}

export function listCatalogCollections() {
  return CATALOG
}

export function lookupCatalogCollection(slug) {
  const entry = CATALOG.find((candidate) => candidate.slug === slug)
  if (!entry) {
    throw new Error(`Unknown catalog collection slug: ${slug}`)
  }

  return normalizeCatalogEntry(entry)
}

export function selectorsFromCatalogCollection(entry) {
  if (entry.type === 'parent') {
    return { parent_inscription_id: entry.ids[0] }
  }

  if (entry.type === 'gallery') {
    return { gallery_inscription_id: entry.ids[0] }
  }

  throw new Error(`Unsupported catalog collection type '${entry.type}' for slug '${entry.slug}'`)
}

export function lookupCatalogCollectionBySelector({ parentInscriptionId = null, galleryInscriptionId = null } = {}) {
  const type = parentInscriptionId ? 'parent' : galleryInscriptionId ? 'gallery' : null
  const selectorId = parentInscriptionId ?? galleryInscriptionId
  if (!type || !selectorId) return null

  const matches = CATALOG
    .filter((candidate) => candidate.type === type)
    .map(normalizeCatalogEntry)
    .filter((candidate) => candidate.ids.includes(selectorId))

  if (matches.length === 0) return null
  if (matches.length > 1) {
    const slugs = matches.map((candidate) => candidate.slug).join(', ')
    throw new Error(`Ambiguous catalog selector '${selectorId}' for type '${type}': ${slugs}`)
  }

  return matches[0]
}

function normalizeCatalogEntry(entry) {
  const refs = normalizeReferenceIds(entry)
  if (refs.length === 0) {
    throw new Error(`Catalog collection '${entry.slug}' does not define any inscription ids`)
  }

  return { ...entry, ids: refs }
}
