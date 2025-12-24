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

  for (const [idx, c] of policy.selling.entries()) {
    ensureObject(c, `config/policy.yml: selling[${idx}]`)
    ensureNonEmptyString(c.slug, `config/policy.yml: selling[${idx}].slug`)
    ensureNonEmptyString(c.title, `config/policy.yml: selling[${idx}].title`)
    ensurePositiveInteger(c.price_sats, `config/policy.yml: selling[${idx}].price_sats`)
    ensureNonEmptyString(c.payment_address, `config/policy.yml: selling[${idx}].payment_address`)

    const hasParent = typeof c.parent_inscription_id === 'string' && c.parent_inscription_id.trim() !== ''
    const hasGallery = typeof c.gallery_inscription_id === 'string' && c.gallery_inscription_id.trim() !== ''
    const hasIds = Array.isArray(c.inscription_ids) && c.inscription_ids.length > 0
    if (!hasParent && !hasGallery && !hasIds) {
      throw new Error(
        `Invalid config/policy.yml: selling[${idx}] must set either parent_inscription_id, gallery_inscription_id, or inscription_ids`
      )
    }

    if (c.optional_payments !== undefined) {
      if (!Array.isArray(c.optional_payments)) {
        throw new Error(`Invalid config/policy.yml: selling[${idx}].optional_payments must be an array`)
      }
      for (const [pidx, p] of c.optional_payments.entries()) {
        ensureObject(p, `config/policy.yml: selling[${idx}].optional_payments[${pidx}]`)
        ensureNonEmptyString(p.title, `config/policy.yml: selling[${idx}].optional_payments[${pidx}].title`)
        ensureNonEmptyString(p.description, `config/policy.yml: selling[${idx}].optional_payments[${pidx}].description`)
        ensurePositiveInteger(p.amount, `config/policy.yml: selling[${idx}].optional_payments[${pidx}].amount`)
        ensureNonEmptyString(p.address, `config/policy.yml: selling[${idx}].optional_payments[${pidx}].address`)
      }
    }
  }
}

export const CONFIG = parse(storeYaml)
export const POLICY = parse(policyYaml)

validateStoreConfig(CONFIG)
validatePolicy(POLICY)
export const POLICY_YAML = policyYaml
