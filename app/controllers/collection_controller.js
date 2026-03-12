import { POLICY } from '../config.js'
import { Collection } from '../models/collection.js'
import { renderCollection } from '../helpers/collection.js'
import { renderLaunchpad } from '../helpers/launchpad.js'
import { htmlResponse } from './html_response.js'
import { countPendingByCollection, getActiveOrdersForInscriptions, listOrdersByCollection } from '../models/db/orders.js'
import { countAvailableInscriptions } from '../models/db/inscriptions.js'
import { parseTurnstileCredentials } from '../utils/turnstile.js'
import { LAUNCHPAD_CACHE_TTL_SECONDS } from '../utils/launchpad_cache.js'
import { resolveLaunchpadWhitelist } from '../utils/launchpad_whitelist.js'

const LAUNCHPAD_FRAME_REFRESH_MS = 5000


function formatRemaining(ms) {
  const safe = Math.max(0, Number(ms || 0))
  const totalSeconds = Math.floor(safe / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  return `${days}d ${hours}h ${minutes}m`
}

async function buildWhitelistStatus({ db, collection }) {
  const nowMs = Date.now()
  const { phase, phaseLabel, whitelist, addressCount } = await resolveLaunchpadWhitelist({
    db,
    collectionSlug: collection.slug,
    policy: collection.policy,
    buyerOrdinalAddress: null,
    nowMs
  })

  if (!whitelist) return null

  const startAt = Number.isFinite(whitelist.startAtMs) ? new Date(whitelist.startAtMs) : null
  const endAt = Number.isFinite(whitelist.endAtMs) ? new Date(whitelist.endAtMs) : null
  const active = phase === 'whitelist'
  const phaseEndsAt = active && endAt ? endAt : null
  const phaseRemainingMs = phaseEndsAt
    ? Math.max(0, phaseEndsAt.getTime() - nowMs)
    : (phase === 'whitelist_upcoming' && startAt ? Math.max(0, startAt.getTime() - nowMs) : null)
  const phaseRemainingText = phaseRemainingMs != null ? formatRemaining(phaseRemainingMs) : null
  const whitelistStartsInText = phase === 'whitelist_upcoming' && startAt
    ? formatRemaining(Math.max(0, startAt.getTime() - nowMs))
    : null
  const publicStartsInText = endAt && nowMs < endAt.getTime()
    ? formatRemaining(Math.max(0, endAt.getTime() - nowMs))
    : null

  return {
    active,
    phase,
    phaseLabel: phase === 'whitelist_upcoming' ? 'Not live' : phaseLabel,
    phaseEndsAt,
    phaseRemainingMs,
    phaseRemainingText,
    whitelistStartsInText,
    publicStartsInText,
    startAt,
    endAt,
    addressCount: Number.isFinite(addressCount) ? addressCount : 0
  }
}

function parsePageParam(c) {
  const page = c.req.query('page')
  if (!page) return null

  return page
}

export async function collectionController(c) {
  const page = parsePageParam(c)
  const slug = c.req.param('collection')
  const db = c.env.DB

  const collection = Collection.lookup(slug)

  if (collection.isLaunchpad) {
    return await launchpadHandler(c, { collection, db })
  }

  const pageData = await collection.listAvailablePage({ db, page })
  const orders = await getActiveOrdersForInscriptions({ db, inscriptionIds: (pageData.inscriptions ?? []).map((i) => i.id) })

  const ordersByInscriptionId = {}
  for (const order of orders) {
    ordersByInscriptionId[order.inscription_id] = order
  }

  const parentInscription = await collection.parentInscription({ db })
  const html = renderCollection({ config: collection.policy, pageData, page, pathname: c.req.path, collection, parentInscription, ordersByInscriptionId })

  return htmlResponse(c, html, { cacheControl: 'public, max-age=0, s-maxage=30' })
}

async function launchpadHandler(c, { collection, db }) {
  const cache = caches.default
  const cacheKey = new Request(c.req.url, { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const [parentInscription, recentSales, availableCount, pendingCount] = await Promise.all([
    collection.parentInscription({ db }),
    listOrdersByCollection({ db, collectionSlug: collection.slug, limit: 10 }),
    countAvailableInscriptions({ db, collectionSlug: collection.slug }),
    countPendingByCollection({ db, collectionSlug: collection.slug })
  ])
  const [turnstileSiteKey] = parseTurnstileCredentials(c.env.TURNSTILE_CREDENTIALS)
  const whitelistStatus = await buildWhitelistStatus({ db, collection })

  const html = renderLaunchpad({
    config: collection.policy,
    collection,
    launchpad: { ...POLICY.launchpad, refresh_ms: LAUNCHPAD_FRAME_REFRESH_MS, turnstile_site_key: turnstileSiteKey },
    parentInscription,
    recentSales,
    availableCount,
    pendingCount,
    whitelistStatus
  })

  const response = htmlResponse(c, html, {
    cacheControl: `public, max-age=0, s-maxage=${LAUNCHPAD_CACHE_TTL_SECONDS}, stale-while-revalidate=${LAUNCHPAD_CACHE_TTL_SECONDS}`
  })
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}
