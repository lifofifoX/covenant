import { CONFIG, POLICY } from '../config.js'
import { renderHome } from '../helpers/home.js'
import { htmlResponse } from './html_response.js'
import { Collection } from '../models/collection.js'

export async function homeController(c) {
  const db = c.env.DB

  const collections = []

  for (const collectionPolicy of POLICY.selling) {
    const collection = Collection.lookup(collectionPolicy.slug)
    const thumbnail = await collection.metadataInscription({ db })
    const availableCount = await collection.availableCount({ db })

    collections.push({
      slug: collection.slug,
      title: collection.title,
      priceSats: collection.policy.price_sats,
      hasParent: Boolean(collectionPolicy.parent_inscription_id),
      hasGallery: Boolean(collectionPolicy.gallery_inscription_id),
      availableCount,
      thumbnail
    })
  }

  const html = renderHome({ config: CONFIG, collections })
  return htmlResponse(c, html, { cacheControl: 'public, max-age=0, s-maxage=30' })
}
