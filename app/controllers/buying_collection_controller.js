import { BuyPolicy } from '../models/buy_policy.js'
import { renderBuyingCollection } from '../helpers/buying.js'
import { htmlResponse } from './html_response.js'
import { listBuyOrdersByCollection } from '../models/db/buy_orders.js'

export async function buyingCollectionController(c) {
  const slug = c.req.param('collection')

  let policy
  try {
    policy = BuyPolicy.lookup(slug)
  } catch {
    return c.text('Not Found', 404)
  }

  const db = c.env.DB
  const parentInscription = await policy.metadataInscription({ db })
  const recentOrders = await listBuyOrdersByCollection({ db, collectionSlug: policy.slug, limit: 10 })

  const html = renderBuyingCollection({ policy, parentInscription, recentOrders })
  return htmlResponse(c, html, { cacheControl: 'public, max-age=0, s-maxage=30' })
}
