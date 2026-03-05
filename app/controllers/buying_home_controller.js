import { BuyPolicy } from '../models/buy_policy.js'
import { htmlResponse } from './html_response.js'
import { renderBuyingHome } from '../helpers/buying.js'
import { CONFIG } from '../config.js'
import { countConfirmedBuysByCollection } from '../models/db/buy_orders.js'

export async function buyingHomeController(c) {
  const db = c.env.DB
  const collections = []

  for (const policyConfig of BuyPolicy.listPolicies()) {
    const policy = BuyPolicy.lookup(policyConfig.slug)
    const thumbnail = await policy.metadataInscription({ db })
    const acquiredCount = await countConfirmedBuysByCollection({ db, collectionSlug: policy.slug })

    collections.push({
      slug: policy.slug,
      title: policy.title,
      priceSats: policy.policy.price_sats,
      hasParent: Boolean(policyConfig.parent_inscription_id),
      hasGallery: Boolean(policyConfig.gallery_inscription_id),
      acquiredCount,
      thumbnail
    })
  }

  const html = renderBuyingHome({ config: CONFIG, collections })
  return htmlResponse(c, html, { cacheControl: 'public, max-age=0, s-maxage=30' })
}
