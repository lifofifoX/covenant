import { Collection } from '../models/collection.js'
import { readJsonWithLimit } from '../utils/request_body.js'
import { normalizeOrdinalAddress } from '../utils/validation.js'
import { parseTurnstileCredentials, verifyTurnstile } from '../utils/turnstile.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function launchpadReserveController(c) {
  const slug = c.req.param('slug')
  const collection = Collection.lookup(slug)

  if (!collection.isLaunchpad) {
    return json({ error: 'Collection is not a launchpad' }, 400)
  }

  const body = await readJsonWithLimit(c.req.raw)
  const buyerOrdinalAddress = normalizeOrdinalAddress(body.buyerOrdinalAddress)
  if (!buyerOrdinalAddress) return json({ error: 'Invalid buyerOrdinalAddress' }, 400)
  const [, turnstileSecret] = parseTurnstileCredentials(c.env.TURNSTILE_CREDENTIALS)

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  const ipLimit = await c.env.LAUNCHPAD_IP_LIMITER.limit({
    key: `reserve-ip:${slug}:${ip}`
  })
  if (!ipLimit.success) return json({ error: 'Rate limit exceeded' }, 429)

  const reserveLimit = await c.env.LAUNCHPAD_ADDRESS_LIMITER.limit({
    key: `reserve:${slug}:${buyerOrdinalAddress}`
  })
  if (!reserveLimit.success) return json({ error: 'Rate limit exceeded' }, 429)

  if (turnstileSecret) {
    const turnstileToken = body.turnstileToken
    if (!turnstileToken) return json({ error: 'Missing turnstileToken' }, 400)

    const { success } = await verifyTurnstile({
      token: turnstileToken,
      secret: turnstileSecret,
      remoteip: ip === 'unknown' ? null : ip
    })

    if (!success) return json({ error: 'Turnstile failed' }, 403)
  }

  const id = c.env.LAUNCHPAD_RESERVATIONS.idFromName(slug)
  const durableObject = c.env.LAUNCHPAD_RESERVATIONS.get(id)

  const response = await durableObject.fetch('https://launchpad/reserve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collectionSlug: slug,
      buyerOrdinalAddress
    })
  })

  const data = await response.json().catch(() => ({}))
  return json(data, response.status)
}
