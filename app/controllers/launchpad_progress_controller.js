import { Collection } from '../models/collection.js'
import { renderLaunchpadProgress } from '../helpers/launchpad.js'
import { htmlResponse } from './html_response.js'
import { countPendingByCollection } from '../models/db/orders.js'
import { LAUNCHPAD_CACHE_TTL_SECONDS } from '../utils/launchpad_cache.js'

export async function launchpadProgressController(c) {
  const slug = c.req.param('slug')
  const collection = Collection.lookup(slug)

  if (!collection.isLaunchpad) {
    return c.text('Not Found', 404)
  }

  const cache = caches.default
  const cacheKey = new Request(c.req.url, { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const [parentInscription, totalSupply, soldCount, pendingCount] = await Promise.all([
    collection.parentInscription({ db: c.env.DB }),
    collection.totalSupply({ db: c.env.DB }),
    collection.soldCount({ db: c.env.DB }),
    countPendingByCollection({ db: c.env.DB, collectionSlug: collection.slug })
  ])

  const html = renderLaunchpadProgress({ collection, parentInscription, totalSupply, soldCount, pendingCount })
  const response = htmlResponse(c, html, {
    cacheControl: `public, max-age=0, s-maxage=${LAUNCHPAD_CACHE_TTL_SECONDS}, stale-while-revalidate=${LAUNCHPAD_CACHE_TTL_SECONDS}`
  })
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}
