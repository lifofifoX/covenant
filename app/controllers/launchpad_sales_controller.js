import { Collection } from '../models/collection.js'
import { renderLaunchpadSales } from '../helpers/launchpad.js'
import { htmlResponse } from './html_response.js'
import { listOrdersByCollection } from '../models/db/orders.js'
import { LAUNCHPAD_CACHE_TTL_SECONDS } from '../utils/launchpad_cache.js'

export async function launchpadSalesController(c) {
  const slug = c.req.param('slug')
  const collection = Collection.lookup(slug)

  if (!collection.isLaunchpad) {
    return c.text('Not Found', 404)
  }

  const cache = caches.default
  const cacheKey = new Request(c.req.url, { method: 'GET' })
  const cached = await cache.match(cacheKey)
  if (cached) return cached

  const recentSales = await listOrdersByCollection({ db: c.env.DB, collectionSlug: collection.slug, limit: 10 })
  const html = renderLaunchpadSales({ recentSales })

  const response = htmlResponse(c, html, {
    cacheControl: `public, max-age=0, s-maxage=${LAUNCHPAD_CACHE_TTL_SECONDS}, stale-while-revalidate=${LAUNCHPAD_CACHE_TTL_SECONDS}`
  })
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}
