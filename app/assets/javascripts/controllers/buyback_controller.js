import { Controller } from '@hotwired/stimulus'
import { base64 } from '@scure/base'
import { RpcErrorCode } from 'sats-connect'

import { requestSignPsbt } from '../utils/index.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export default class extends Controller {
  static targets = ['loading', 'empty', 'inventory', 'errorPanel', 'errorMessage', 'successPanel', 'successLink']
  static values = { collection: String, price: Number }

  connect() {
    if (Wallet.connected) this.onWalletConnected()
  }

  onWalletConnected() {
    this.loadEligible()
  }

  onWalletDisconnected() {
    this.inventoryTarget.innerHTML = ''
    this.successPanelTarget.classList.add('hidden')
    this.errorPanelTarget.classList.add('hidden')
    this.emptyTarget.classList.remove('hidden')
    this.emptyTarget.textContent = 'Connect a wallet to inspect eligible inscriptions.'
  }

  async loadEligible() {
    if (!Wallet.connected) return

    this.#showLoading()
    this.#hideMessages()

    try {
      const response = await fetch(`/buying/${encodeURIComponent(this.collectionValue)}/eligible?ordinalAddress=${encodeURIComponent(Wallet.ordinalAddress.address)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(String(data.error || 'Unable to load eligible inscriptions'))

      const inscriptions = Array.isArray(data.inscriptions) ? data.inscriptions : []
      this.#renderInventory(inscriptions)
    } catch (error) {
      this.inventoryTarget.innerHTML = ''
      this.emptyTarget.classList.add('hidden')
      this.#showError(error?.message ?? error)
    } finally {
      this.loadingTarget.classList.add('hidden')
    }
  }

  async sell(event) {
    const button = event.currentTarget
    const inscriptionId = button.dataset.inscriptionId
    if (!inscriptionId) return

    this.#hideMessages()
    this.#setItemBusy(button, true, 'Preparing…')

    try {
      const prepareResponse = await fetch(`/buying/${encodeURIComponent(this.collectionValue)}/prepare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inscriptionId,
          sellerOrdinalAddress: Wallet.ordinalAddress.address,
          sellerPaymentAddress: Wallet.paymentAddress.address
        })
      })

      const prepareData = await prepareResponse.json().catch(() => ({}))
      if (!prepareResponse.ok) throw new Error(String(prepareData.error || 'Unable to prepare sale'))

      const signResponse = await requestSignPsbt({
        psbt: base64.decode(prepareData.psbt),
        signInputs: { [Wallet.ordinalAddress.address]: [0] }
      })

      if (signResponse.status !== 'success') {
        if (signResponse.error?.code !== RpcErrorCode.USER_REJECTION) {
          throw new Error(signResponse.error?.message || 'Wallet rejected the request')
        }

        this.#setItemBusy(button, false, 'Sell This Inscription')
        return
      }

      this.#setItemBusy(button, true, 'Broadcasting…')

      const executeResponse = await fetch(`/buying/${encodeURIComponent(this.collectionValue)}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tradeId: prepareData.tradeId,
          signedPsbt: signResponse.result.psbt
        })
      })

      const executeData = await executeResponse.json().catch(() => ({}))
      if (!executeResponse.ok) throw new Error(String(executeData.error || 'Unable to execute sale'))

      const txid = executeData?.order?.txid ? String(executeData.order.txid) : ''
      if (txid) {
        this.successLinkTarget.href = `https://mempool.space/tx/${txid}`
        this.successPanelTarget.classList.remove('hidden')
      }

      const item = button.closest('[data-buyback-item]')
      if (item) item.remove()

      if (this.inventoryTarget.children.length === 0) {
        this.emptyTarget.classList.remove('hidden')
        this.emptyTarget.textContent = 'No more eligible inscriptions in this wallet.'
      }
    } catch (error) {
      this.#showError(error?.message ?? error)
      this.#setItemBusy(button, false, 'Sell This Inscription')
    }
  }

  #showLoading() {
    this.loadingTarget.classList.remove('hidden')
    this.emptyTarget.classList.add('hidden')
    this.inventoryTarget.innerHTML = ''
  }

  #renderInventory(inscriptions) {
    if (inscriptions.length === 0) {
      this.inventoryTarget.innerHTML = ''
      this.emptyTarget.classList.remove('hidden')
      this.emptyTarget.textContent = 'No eligible inscriptions found in this wallet.'
      return
    }

    this.emptyTarget.classList.add('hidden')
    this.inventoryTarget.innerHTML = inscriptions.map((inscription) => {
      const media = inscription.isImage
        ? `<img src="${escapeHtml(inscription.contentUrl)}" alt="${escapeHtml(inscription.title)}" loading="lazy" decoding="async" style="image-rendering: pixelated; width: 100%; height: 220px; object-fit: cover;" />`
        : `<iframe src="${escapeHtml(inscription.previewUrl)}" loading="lazy" style="width: 100%; height: 220px; border: 0; pointer-events: none;"></iframe>`

      return `
        <article class="collection-card" data-buyback-item>
          <div class="card-image" style="height: 220px; overflow: hidden;">${media}</div>
          <h3 class="card-title">${escapeHtml(inscription.title)}</h3>
          <div class="card-meta" style="margin-bottom: 1rem;">
            <span>#${escapeHtml(inscription.number)}</span>
            <span>${escapeHtml(this.#formatPrice(this.priceValue))}</span>
          </div>
          <button
            class="btn btn-accent btn-block"
            type="button"
            data-inscription-id="${escapeHtml(inscription.id)}"
            data-action="click->buyback#sell"
          >Sell This Inscription</button>
        </article>
      `
    }).join('')
  }

  #setItemBusy(button, busy, label) {
    button.disabled = busy
    button.textContent = label
  }

  #showError(message) {
    this.errorMessageTarget.textContent = String(message)
    this.errorPanelTarget.classList.remove('hidden')
  }

  #hideMessages() {
    this.errorPanelTarget.classList.add('hidden')
    this.successPanelTarget.classList.add('hidden')
  }

  #formatPrice(priceSats) {
    return `${(Number(priceSats) / 100000000).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 8
    })} BTC`
  }
}
