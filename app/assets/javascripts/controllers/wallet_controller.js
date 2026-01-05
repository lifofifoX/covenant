import { Controller } from '@hotwired/stimulus'
import { shorten } from '../utils/index.js'

export default class extends Controller {
  static targets = ['selector', 'backdrop', 'xverse', 'unisat', 'addressPreview']

  connect() {
    if (Wallet.connected) this.#onWalletConnected()
  }

  async #onWalletConnected() {
    if (Wallet.provider === "unisat") {
      const checkUnisat = setInterval(async () => {
        if (window.unisat) {
          clearInterval(checkUnisat)
          this.#setConnected()
        }
      }, 10)
    } else {
      this.#setConnected()
    }
  }

  select() {
    if (!window.unisat) this.unisatTarget.setAttribute('disabled', true)
    if (!window.btc_providers?.some((e) => e.name === 'Xverse Wallet')) this.xverseTarget.setAttribute('disabled', true)

    const height = this.selectorTarget.offsetHeight
    this.selectorTarget.style.setProperty('--selector-height', `${height}px`)
    this.selectorTarget.dataset.state = 'open'

    // Show backdrop on mobile
    if (this.hasBackdropTarget) {
      this.backdropTarget.classList.remove('opacity-0', 'pointer-events-none')
      this.backdropTarget.classList.add('opacity-100', 'pointer-events-auto')
    }
  }

  close() {
    if (this.hasSelectorTarget) this.selectorTarget.dataset.state = 'closed'

    // Hide backdrop
    if (this.hasBackdropTarget) {
      this.backdropTarget.classList.remove('opacity-100', 'pointer-events-auto')
      this.backdropTarget.classList.add('opacity-0', 'pointer-events-none')
    }
  }

  closeIfClickedOutside(event) {
    if (!this.selectorTarget.contains(event.target)) this.close()
  }

  authorize({ params }) {
    Wallet.setup(params.provider)

    Wallet.authorize().then((addresses) => {
      this.#onConnected(addresses)
    }).catch((error) => {
      this.close()
    })
  }

  logout() {
    Wallet.reset()
    this.#setDisconnected()
  }

  #onConnected(addresses) {
    this.close()
    Wallet.save(JSON.stringify(addresses))
    this.#setConnected()
  }

  #setConnected() {
    this.addressPreviewTargets.forEach(target => target.innerHTML = shorten(Wallet.paymentAddress.address))
    this.dispatch("connected", { target: window, detail: { paymentAddress: Wallet.paymentAddress } })
  }

  #setDisconnected() {
    this.addressPreviewTargets.forEach(target => target.innerHTML = "")
    this.dispatch("disconnected", { target: window })
  }
}
