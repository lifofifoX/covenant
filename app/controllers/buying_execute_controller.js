import { BuyPolicy } from '../models/buy_policy.js'
import { readJsonWithLimit } from '../utils/request_body.js'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

export async function buyingExecuteController(c) {
  const slug = c.req.param('slug')

  let policy
  try {
    policy = BuyPolicy.lookup(slug)
  } catch {
    return json({ error: 'Not found' }, 404)
  }

  const body = await readJsonWithLimit(c.req.raw)
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  const ipLimit = await c.env.BUYING_EXECUTE_IP_LIMITER.limit({
    key: `buy-execute-ip:${slug}:${ip}`
  })
  if (!ipLimit.success) return json({ error: 'Rate limit exceeded' }, 429)

  const id = c.env.BUY_POLICY.idFromName(policy.slug)
  const durableObject = c.env.BUY_POLICY.get(id)

  const response = await durableObject.fetch('https://buy-policy/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tradeId: body.tradeId,
      signedPsbt: body.signedPsbt
    })
  })

  const data = await response.json().catch(() => ({}))
  return json(data, response.status)
}
