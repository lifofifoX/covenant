import { Collection } from '../models/collection.js'
import { parseSignedPsbt } from '../utils/psbt.js'
import { readJsonWithLimit } from '../utils/request_body.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function executeSellController(c) {
  const slug = c.req.param('slug')
  const collection = Collection.lookup(slug)

  if (collection.isLaunchpad) {
    return json({ error: 'Launchpad mints must use /launchpad/:slug/mint' }, 400)
  }

  const body = await readJsonWithLimit(c.req.raw)

  const signedPsbt = body.signedPsbt
  if (!signedPsbt) return json({ error: 'Missing signedPsbt' }, 400)

  parseSignedPsbt(signedPsbt)

  const inscription = await collection.loadInscription({ db: c.env.DB, inscriptionId: body.inscriptionId })
  if (!inscription) return json({ error: 'Inscription is not available' }, 404)

  const id = c.env.SIGNING_AGENT.idFromName(`${slug}:${inscription.id}`)
  const durableObject = c.env.SIGNING_AGENT.get(id)

  const response = await durableObject.fetch('https://signing-agent/sell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collectionSlug: slug,
      inscriptionId: inscription.id,
      signedPsbt
    })
  })

  const data = await response.json().catch(() => ({}))

  return json(data, response.status)
}
