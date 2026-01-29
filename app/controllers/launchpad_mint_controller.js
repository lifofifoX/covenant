import { Collection } from '../models/collection.js'
import { parseSignedPsbt } from '../utils/psbt.js'
import { readJsonWithLimit } from '../utils/request_body.js'
import { isValidInscriptionId, normalizeOrdinalAddress } from '../utils/validation.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function launchpadMintController(c) {
  const slug = c.req.param('slug')
  const collection = Collection.lookup(slug)

  if (!collection.isLaunchpad) {
    return json({ error: 'Collection is not a launchpad' }, 400)
  }

  const body = await readJsonWithLimit(c.req.raw)
  const buyerOrdinalAddress = normalizeOrdinalAddress(body.buyerOrdinalAddress)
  const inscriptionId = body.inscriptionId
  const signedPsbt = body.signedPsbt

  if (!signedPsbt) return json({ error: 'Missing signedPsbt' }, 400)
  if (!buyerOrdinalAddress) return json({ error: 'Invalid buyerOrdinalAddress' }, 400)
  if (!isValidInscriptionId(inscriptionId)) return json({ error: 'Invalid inscriptionId' }, 400)

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  const ipLimit = await c.env.LAUNCHPAD_IP_LIMITER.limit({
    key: `mint-ip:${slug}:${ip}`
  })
  if (!ipLimit.success) return json({ error: 'Rate limit exceeded' }, 429)

  const mintLimit = await c.env.LAUNCHPAD_ADDRESS_LIMITER.limit({
    key: `mint:${slug}:${buyerOrdinalAddress}`
  })
  if (!mintLimit.success) return json({ error: 'Rate limit exceeded' }, 429)

  parseSignedPsbt(signedPsbt)

  const id = c.env.LAUNCHPAD_RESERVATIONS.idFromName(slug)
  const durableObject = c.env.LAUNCHPAD_RESERVATIONS.get(id)

  const response = await durableObject.fetch('https://launchpad/mint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collectionSlug: slug,
      inscriptionId,
      signedPsbt,
      buyerOrdinalAddress
    })
  })

  const data = await response.json().catch(() => ({}))
  return json(data, response.status)
}
