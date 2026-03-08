import { CONFIG } from '../config.js'
import { fetchJSON } from '../utils/fetch_json.js'

class MempoolClient {
  constructor({ baseUrl }) {
    this.baseUrl = String(baseUrl).endsWith('/') ? String(baseUrl).slice(0, -1) : String(baseUrl)
  }

  feeEstimates() {
    return fetchJSON(`${this.baseUrl}/fee-estimates`)
  }

  addressUTXOs(address) {
    return fetchJSON(`${this.baseUrl}/address/${address}/utxo`)
  }

  txOutspends(txid) {
    return fetchJSON(`${this.baseUrl}/tx/${txid}/outspends`)
  }

  txOutspend(txid, vout) {
    return fetchJSON(`${this.baseUrl}/tx/${txid}/outspend/${vout}`)
  }

  async txTest(rawTxHex) {
    const result = await fetchJSON(`${this.baseUrl}/txs/test`, {
      method: 'POST',
      body: JSON.stringify([rawTxHex])
    })

    const item = Array.isArray(result) ? result[0] : null
    const allowed = Boolean(item?.allowed)
    const rejectReason = item?.['reject-reason'] ?? null
    const vsize = item?.vsize ?? null

    const effective = Number(item?.fees?.['effective-feerate'])
    const effectiveFeeRateSatVb = effective ? (effective * 100_000_000) / 1000 : null

    return { allowed, rejectReason, vsize, effectiveFeeRateSatVb }
  }

  async testMempoolAccept(rawTxHexes) {
    const result = await fetchJSON(`${this.baseUrl}/txs/test`, {
      method: 'POST',
      body: JSON.stringify(rawTxHexes)
    })

    if (!Array.isArray(result) || result.length === 0) return 'unexpected-response'

    const rejected = result.find((item) => item?.allowed !== true)
    if (!rejected) return true

    const reason = rejected['reject-reason']
    if (reason === 'txn-already-in-mempool') return true

    return reason ?? 'unknown'
  }

  async broadcastTx(rawHex) {
    let response = null
    try {
      response = await fetch(`${this.baseUrl}/tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: rawHex
      })
    } catch (error) {
      const message = error?.message ? String(error.message) : 'Broadcast failed'
      return `HTTP 0: ${message}`
    }

    if (response.ok) return true

    const text = await response.text().catch(() => '')
    if (response.status === 400 && /(already in mempool|txn-already-in-mempool|already confirmed|already known)/i.test(text)) {
      return true
    }
    return text ? `HTTP ${response.status}: ${String(text)}` : `HTTP ${response.status}`
  }

  async tx(txid) {
    const response = await fetch(`${this.baseUrl}/tx/${txid}`, {
      headers: { Accept: 'application/json' }
    })

    if (response.status === 404) return null
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)

    return await response.json()
  }
}

export const Mempool = new MempoolClient({ baseUrl: CONFIG.electrs_api_url })
