import { BuyPolicy } from '../models/buy_policy.js'
import { renderBuyingActivity } from '../helpers/buying.js'
import { htmlResponse } from './html_response.js'
import { listBuyOrdersByCollection } from '../models/db/buy_orders.js'

export async function buyingActivityController(c) {
  const slug = c.req.param('slug')

  let policy
  try {
    policy = BuyPolicy.lookup(slug)
  } catch {
    return c.text('Not Found', 404)
  }

  const orders = await listBuyOrdersByCollection({ db: c.env.DB, collectionSlug: policy.slug, limit: 10 })
  const html = renderBuyingActivity({ orders })
  return htmlResponse(c, html, { cacheControl: 'public, max-age=0, s-maxage=30' })
}
