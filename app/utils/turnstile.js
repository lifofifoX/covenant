export function parseTurnstileCredentials(value) {
  const [siteKey, secret] = value?.split(':') ?? []
  return [siteKey, secret]
}

export async function verifyTurnstile({ token, secret, remoteip }) {
  const body = new URLSearchParams({
    secret,
    response: token
  })

  if (remoteip) body.set('remoteip', remoteip)

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })

  const data = await response.json().catch(() => ({}))
  return { success: Boolean(data?.success), data }
}
