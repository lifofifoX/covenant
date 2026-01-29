import { parse } from 'yaml'
import storeYaml from '../config/store.yml'
import policyYaml from '../config/policy.yml'

function ensureObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid ${label}: expected an object`)
  }
}

function ensureNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid ${label}: expected a non-empty string`)
  }
}

function ensurePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}: expected a positive integer`)
  }
}

function validateCollectionPolicy({ collection, label, requireMinPostage }) {
  ensureObject(collection, label)
  ensureNonEmptyString(collection.slug, `${label}.slug`)
  ensureNonEmptyString(collection.title, `${label}.title`)
  ensurePositiveInteger(collection.price_sats, `${label}.price_sats`)
  ensureNonEmptyString(collection.payment_address, `${label}.payment_address`)

  if (requireMinPostage) {
    ensurePositiveInteger(collection.lowest_inscription_utxo_size, `${label}.lowest_inscription_utxo_size`)
  }

  const hasParent = typeof collection.parent_inscription_id === 'string' && collection.parent_inscription_id.trim() !== ''
  const hasGallery = typeof collection.gallery_inscription_id === 'string' && collection.gallery_inscription_id.trim() !== ''
  const hasIds = Array.isArray(collection.inscription_ids) && collection.inscription_ids.length > 0
  if (!hasParent && !hasGallery && !hasIds) {
    throw new Error(
      `Invalid ${label}: must set either parent_inscription_id, gallery_inscription_id, or inscription_ids`
    )
  }

  if (collection.optional_payments !== undefined) {
    if (!Array.isArray(collection.optional_payments)) {
      throw new Error(`Invalid ${label}.optional_payments: expected an array`)
    }
    for (const [pidx, p] of collection.optional_payments.entries()) {
      ensureObject(p, `${label}.optional_payments[${pidx}]`)
      ensureNonEmptyString(p.title, `${label}.optional_payments[${pidx}].title`)
      ensureNonEmptyString(p.description, `${label}.optional_payments[${pidx}].description`)
      ensurePositiveInteger(p.amount, `${label}.optional_payments[${pidx}].amount`)
      ensureNonEmptyString(p.address, `${label}.optional_payments[${pidx}].address`)
    }
  }
}

function validateStoreConfig(config) {
  ensureObject(config, 'config/store.yml')
  ensureNonEmptyString(config.ord_api_url, 'config/store.yml: ord_api_url')
  ensureNonEmptyString(config.electrs_api_url, 'config/store.yml: electrs_api_url')
  ensureNonEmptyString(config.mempool_space_api_url, 'config/store.yml: mempool_space_api_url')
  ensureNonEmptyString(config.theme, 'config/store.yml: theme')
  ensurePositiveInteger(config.page_size, 'config/store.yml: page_size')
}

function validatePolicy(policy) {
  ensureObject(policy, 'config/policy.yml')

  if (!Array.isArray(policy.selling)) {
    throw new Error(`Invalid config/policy.yml: expected 'selling' to be an array`)
  }

  const launchpad = policy.launchpad
  const launchpadCollections = Array.isArray(launchpad?.collections) ? launchpad.collections : []

  if (launchpad !== undefined) {
    ensureObject(launchpad, 'config/policy.yml: launchpad')
    ensureNonEmptyString(launchpad.seller_address, 'config/policy.yml: launchpad.seller_address')
    if (!Array.isArray(launchpad.collections)) {
      throw new Error(`Invalid config/policy.yml: launchpad.collections must be an array`)
    }
  }

  for (const [idx, c] of policy.selling.entries()) {
    validateCollectionPolicy({
      collection: c,
      label: `config/policy.yml: selling[${idx}]`,
      requireMinPostage: false
    })
  }

  for (const [idx, c] of launchpadCollections.entries()) {
    validateCollectionPolicy({
      collection: c,
      label: `config/policy.yml: launchpad.collections[${idx}]`,
      requireMinPostage: true
    })
  }

  const seenSlugs = new Set()
  for (const collection of [...policy.selling, ...launchpadCollections]) {
    if (seenSlugs.has(collection.slug)) {
      throw new Error(`Invalid config/policy.yml: duplicate collection slug '${collection.slug}'`)
    }
    seenSlugs.add(collection.slug)
  }
}

export const CONFIG = parse(storeYaml)
export const POLICY = parse(policyYaml)

validateStoreConfig(CONFIG)
validatePolicy(POLICY)
export const POLICY_YAML = policyYaml
