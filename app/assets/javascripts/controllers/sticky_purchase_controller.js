import { Controller } from '@hotwired/stimulus'

export default class extends Controller {
  static targets = ['trigger', 'sticky', 'price', 'button']
  static values = { price: String }

  connect() {
    this.visible = false
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Show sticky when trigger is NOT visible (scrolled past)
          if (entry.isIntersecting) {
            this.hide()
          } else {
            this.show()
          }
        })
      },
      { threshold: 0, rootMargin: '-60px 0px 0px 0px' }
    )

    if (this.hasTriggerTarget) {
      this.observer.observe(this.triggerTarget)
    }
  }

  disconnect() {
    this.observer?.disconnect()
  }

  show() {
    if (this.visible) return
    this.visible = true
    this.stickyTarget.classList.remove('translate-y-full')
    this.stickyTarget.classList.add('translate-y-0')
  }

  hide() {
    if (!this.visible) return
    this.visible = false
    this.stickyTarget.classList.remove('translate-y-0')
    this.stickyTarget.classList.add('translate-y-full')
  }

  buy(event) {
    // Trigger the main inscription controller's buy flow
    const inscriptionEl = document.querySelector('[data-controller~="inscription"]')
    if (inscriptionEl) {
      const buyButton = inscriptionEl.querySelector('[data-inscription-target="buyButton"]')
      const prepareButton = inscriptionEl.querySelector('[data-inscription-target="prepareButton"]')

      // If buy button is visible and enabled, click it
      if (buyButton && !buyButton.classList.contains('hidden') && !buyButton.disabled) {
        buyButton.click()
      }
      // Otherwise if prepare button is visible, click it
      else if (prepareButton && !prepareButton.classList.contains('hidden') && !prepareButton.disabled) {
        prepareButton.click()
      }
    }
  }

  connect_wallet(event) {
    // Trigger wallet connection
    const walletEl = document.querySelector('[data-controller~="wallet"]')
    if (walletEl) {
      const selectButton = walletEl.querySelector('[data-action="wallet#select"]')
      if (selectButton) selectButton.click()
    }
  }
}
