import { base64, hex } from "@scure/base"
import { request } from "sats-connect"
import * as btc from "@scure/btc-signer"
export { fetchJSON } from "../../../utils/fetch_json.js"

export function formatSats(amount) {
  return `${btc.Decimal.encode(BigInt(amount))} BTC`
}

export function shorten(str) {
  return `${str.substr(0, 5)}…${str.substr(-5)}`
}

export function debounce(fn, delay = 1000) {
  let timeoutId = null

  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn.apply(this, args), delay)
  }
}

export async function requestSignPsbt({ psbt, signInputs }) {
  if (Wallet.isUnisat) {
    let toSignInputs = []

    Object.entries(signInputs).forEach(([address, indices]) => {
      indices.forEach(index => {
        toSignInputs.push({ index, address })
      })
    })

    const response = await window.unisat.signPsbt(hex.encode(psbt), { autoFinalized: false, toSignInputs: toSignInputs })
    return { status: "success", result: { psbt: base64.encode(hex.decode(response)) } }
  } else {
    return request('signPsbt', { psbt: base64.encode(psbt), broadcast: false, signInputs: signInputs })
  }
}
