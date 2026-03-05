export { BuyPolicyWorker } from './buy_policy_worker.js'
export { FundingWalletWorker } from './funding_wallet_worker.js'

export default {
  fetch() {
    return new Response('Not found', { status: 404 })
  }
}
