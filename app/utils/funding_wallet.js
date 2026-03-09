const FUNDING_WALLET_NAME = 'funding-wallet'

function fundingWalletError(message, status = 500, code = null) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

export async function requestFundingWallet(env, pathname, body = null) {
  if (!env.FUNDING_WALLET) {
    throw fundingWalletError('Funding wallet is not configured')
  }

  const id = env.FUNDING_WALLET.idFromName(FUNDING_WALLET_NAME)
  const durableObject = env.FUNDING_WALLET.get(id)
  const response = await durableObject.fetch(`https://funding-wallet${pathname}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw fundingWalletError(
      data?.error ? String(data.error) : `Funding wallet request failed with status ${response.status}`,
      response.status,
      data?.code ?? null
    )
  }

  return data
}

export async function refreshFundingWalletState(env) {
  if (!env.FUNDING_WALLET) return
  return requestFundingWallet(env, '/refresh', {})
}
