import { countLaunchpadWhitelistEntries, getLaunchpadWhitelistEntry } from '../models/db/launchpad_whitelist.js'
import { normalizeOrdinalAddress } from './validation.js'

function parseWhitelistPolicy(policy) {
  const whitelist = policy?.whitelist
  if (!whitelist || typeof whitelist !== 'object') return null

  const startAtMs = whitelist.start_at ? Date.parse(whitelist.start_at) : null
  const endAtMs = whitelist.end_at ? Date.parse(whitelist.end_at) : null
  const addresses = Array.isArray(whitelist.addresses)
    ? new Set(whitelist.addresses.map((address) => normalizeOrdinalAddress(address)).filter(Boolean))
    : new Set()

  const defaultCap = Number(whitelist.max_mints_per_address ?? 0)

  return { startAtMs, endAtMs, addresses, defaultCap }
}

function toPhase({ startAtMs, endAtMs, nowMs }) {
  if (startAtMs && nowMs < startAtMs) return { phase: 'whitelist_upcoming', phaseLabel: 'Whitelist (Upcoming)' }
  if (!endAtMs || nowMs < endAtMs) return { phase: 'whitelist', phaseLabel: 'Whitelist' }
  return { phase: 'public', phaseLabel: 'Public' }
}

export async function resolveLaunchpadWhitelist({ db, collectionSlug, policy, buyerOrdinalAddress = null, nowMs = Date.now() }) {
  const parsed = parseWhitelistPolicy(policy)
  if (!parsed) {
    return { phase: 'public', phaseLabel: 'Public', whitelist: null, eligible: true, cap: null, addressCount: 0 }
  }

  const staticCount = parsed.addresses.size
  const dbCount = await countLaunchpadWhitelistEntries({ db, collectionSlug })
  const addressCount = staticCount + dbCount
  if (staticCount === 0 && dbCount === 0) {
    return { phase: 'public', phaseLabel: 'Public', whitelist: parsed, eligible: true, cap: null, addressCount }
  }

  const phase = toPhase({ startAtMs: parsed.startAtMs, endAtMs: parsed.endAtMs, nowMs })

  let eligible = true
  let cap = Number.isInteger(parsed.defaultCap) && parsed.defaultCap > 0 ? parsed.defaultCap : null
  let dbEntry = null

  if (buyerOrdinalAddress && (phase.phase === 'whitelist' || phase.phase === 'whitelist_upcoming')) {
    const normalized = normalizeOrdinalAddress(buyerOrdinalAddress)
    if (!normalized) {
      eligible = false
    } else {
      const staticEligible = parsed.addresses.has(normalized)
      dbEntry = await getLaunchpadWhitelistEntry({ db, collectionSlug, addressNormalized: normalized })
      const dbEligible = Boolean(dbEntry)
      eligible = staticEligible || dbEligible

      const addressCap = Number(dbEntry?.max_mints ?? 0)
      if (Number.isInteger(addressCap) && addressCap > 0) cap = addressCap
    }
  }

  return { ...phase, whitelist: parsed, eligible, cap, dbEntry, addressCount }
}
