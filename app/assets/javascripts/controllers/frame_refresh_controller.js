import { Controller } from '@hotwired/stimulus'

export default class extends Controller {
  static values = { interval: Number }

  connect() {
    const interval = Number.isFinite(this.intervalValue) && this.intervalValue > 0
      ? this.intervalValue
      : 60000

    this.timer = setInterval(() => this.#reload(), interval)
  }

  disconnect() {
    if (this.timer) clearInterval(this.timer)
  }

  #reload() {
    this.element.reload()
  }
}
