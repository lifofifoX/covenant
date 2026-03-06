import { BuyPolicy } from '../models/buy_policy.js'
import { readJsonWithLimit } from '../utils/request_body.js'
import { normalizeOrdinalAddress } from '../utils/validation.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function buyingPrepareController(c) {
  const slug = c.req.param('slug')

  let policy
  try {
    policy = BuyPolicy.lookup(slug)
  } catch {
    return json({ error: 'Not found' }, 404)
  }

  const body = await readJsonWithLimit(c.req.raw)
  const sellerOrdinalAddress = normalizeOrdinalAddress(body.sellerOrdinalAddress)
  if (!sellerOrdinalAddress) return json({ error: 'Invalid sellerOrdinalAddress' }, 400)

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  const ipLimit = await c.env.BUYING_PREPARE_IP_LIMITER.limit({
    key: `buy-prepare-ip:${slug}:${ip}`
  })
  if (!ipLimit.success) return json({ error: 'Rate limit exceeded' }, 429)

  const addressLimit = await c.env.BUYING_PREPARE_ADDRESS_LIMITER.limit({
    key: `buy-prepare:${slug}:${sellerOrdinalAddress}`
  })
  if (!addressLimit.success) return json({ error: 'Rate limit exceeded' }, 429)

  const id = c.env.BUY_POLICY.idFromName(policy.slug)
  const durableObject = c.env.BUY_POLICY.get(id)

  const response = await durableObject.fetch('https://buy-policy/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collectionSlug: policy.slug,
      inscriptionId: body.inscriptionId,
      sellerOrdinalAddress,
      sellerOrdinalPublicKey: body.sellerOrdinalPublicKey,
      sellerPaymentAddress: body.sellerPaymentAddress
    })
  })

  const data = await response.json().catch(() => ({}))
  return json(data, response.status)
}
