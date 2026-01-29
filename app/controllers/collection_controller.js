import { POLICY } from '../config.js'
import { Collection } from '../models/collection.js'
import { renderCollection } from '../helpers/collection.js'
import { renderLaunchpad } from '../helpers/launchpad.js'
import { htmlResponse } from './html_response.js'
import { countPendingByCollection, getActiveOrdersForInscriptions, listOrdersByCollection } from '../models/db/orders.js'
import { parseTurnstileCredentials } from '../utils/turnstile.js'
import { LAUNCHPAD_CACHE_TTL_SECONDS } from '../utils/launchpad_cache.js'

const LAUNCHPAD_FRAME_REFRESH_MS = 5000

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

  const [parentInscription, recentSales, totalSupply, soldCount, pendingCount] = await Promise.all([
    collection.parentInscription({ db }),
    listOrdersByCollection({ db, collectionSlug: collection.slug, limit: 10 }),
    collection.totalSupply({ db }),
    collection.soldCount({ db }),
    countPendingByCollection({ db, collectionSlug: collection.slug })
  ])
  const [turnstileSiteKey] = parseTurnstileCredentials(c.env.TURNSTILE_CREDENTIALS)

  const html = renderLaunchpad({
    config: collection.policy,
    collection,
    launchpad: { ...POLICY.launchpad, refresh_ms: LAUNCHPAD_FRAME_REFRESH_MS, turnstile_site_key: turnstileSiteKey },
    parentInscription,
    recentSales,
    totalSupply,
    soldCount,
    pendingCount
  })

  const response = htmlResponse(c, html, {
    cacheControl: `public, max-age=0, s-maxage=${LAUNCHPAD_CACHE_TTL_SECONDS}, stale-while-revalidate=${LAUNCHPAD_CACHE_TTL_SECONDS}`
  })
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}
