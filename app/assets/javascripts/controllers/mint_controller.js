import { Controller } from '@hotwired/stimulus'
import * as btc from "@scure/btc-signer"
import { RpcErrorCode } from "sats-connect"

import { formatSats, requestSignPsbt } from '../utils/index.js'
import { Mempool } from '../../../models/mempool.js'

const BASE_TX_SIZE = 10.5
const PADDING = 546n
const USER_REJECTED_SIGN_REQUEST_MESSAGE = "User rejected the request."

export default class extends Controller {
  static targets = [
    'form',
    'connectButton',
    'prepareButton',
    'prepareSpinner',
    'prepareLabel',
    'mintButton',
    'mintSpinner',
    'mintLabel',
    'turnstile',
    'optionalPayment',
    'fees',
    'feeRate',
    'fee',
    'total',
    'successPanel',
    'successTitle',
    'successLink',
    'errorPanel',
    'errorTitle',
    'errorMessage'
  ]
  static values = { collection: String, price: Number, paymentAddress: String, lowestInscriptionUtxoSize: Number, sellerAddress: String }

  #utxos = []
  #mempoolFees = []
  #inscriptionMetadata = null
  #prepared = false
  #turnstileToken = null

  connect() {
    this.walletConnectedRun = false
    this.txid = null

    if (this.hasTurnstileTarget) this.#attachTurnstileCallbacks()

    if (Wallet.connected && Wallet.provider === 'unisat') {
      const checkUnisat = setInterval(() => {
        if (window.unisat) {
          clearInterval(checkUnisat)
          this.onWalletConnected()
        }
      }, 10)
    } else if (Wallet.connected) {
      this.onWalletConnected()
    }
  }

  onWalletConnected() {
    if (this.walletConnectedRun) return
    this.walletConnectedRun = true

    this.prepare()
  }

  onWalletDisconnected() {
    window.location.reload()
  }

  disconnect() {
    this.#detachTurnstileCallbacks()
  }

  async prepare() {
    this.#disableForm()
    this.#hideError()
    this.#setPreparingState()

    try {
      await Promise.all([
        this.#loadUTXOs(),
        this.#loadMempoolFees()
      ])

      this.#setMintState()
      this.#prepared = true
      await this.calculateCost()
    } catch (error) {
      this.#prepared = false
      this.#showError({ title: 'Prepare Failed', error })
      this.#resetPrepareButton()
    } finally {
      this.#enableForm()
    }
  }

  async mint() {
    this.#disableForm()
    this.#hideError()
    this.#setMintingState()

    try {
      await this.#reserve()
      const { psbt, signInputs } = this.#constructPurchaseTx()
      const response = await requestSignPsbt({ psbt, signInputs })

      if (response.status === "success") {
        const executeResponse = await fetch(`/launchpad/${encodeURIComponent(this.collectionValue)}/mint`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inscriptionId: this.#inscriptionMetadata.id,
            signedPsbt: response.result.psbt,
            buyerOrdinalAddress: Wallet.ordinalAddress.address
          })
        })

        const data = await executeResponse.json()
        if (!executeResponse.ok) {
          if (data.code === 'fee_too_low') {
            await this.#loadMempoolFees()
            await this.calculateCost()
            this.#showError({ title: 'Fee rate too low', error: data.error })
            this.#resetMintButton()
            this.#enableForm()
            return
          }

          throw new Error(String(data.error))
        }

        this.txid = data?.order?.txid ? String(data.order.txid) : null
        this.#setSuccessState()
      } else {
        this.#resetTurnstile()
        this.#resetMintButton()
        this.#enableForm()

        if (response.error.code !== RpcErrorCode.USER_REJECTION) {
          this.#showError({ title: 'Mint Failed', error: response.error.message })
        }
      }
    } catch (error) {
      this.#resetTurnstile()
      this.#showError({ title: 'Mint Failed', error })
      this.#resetMintButton()
      this.#enableForm()
    }
  }

  async calculateCost() {
    if (!this.#prepared) return false

    try {
      this.#hideError()

      const { networkFees, satsRequired } = this.#determineFeesAndUTXOs()

      this.feeRateTarget.textContent = `${this.#networkFeeRate} sat/vB`
      this.feeTarget.textContent = formatSats(networkFees)
      this.totalTarget.textContent = formatSats(satsRequired)

      const totalUsd = this.element.querySelector('[data-usd-role="total"]')
      if (totalUsd) totalUsd.setAttribute('data-usd-sats', String(satsRequired))

      return true
    } catch (error) {
      console.log(error)
      this.#showError({ title: 'Something went wrong', error })
      return false
    }
  }

  async #reserve() {
    const payload = { buyerOrdinalAddress: Wallet.ordinalAddress.address }
    if (this.hasTurnstileTarget) payload.turnstileToken = this.#turnstileToken

    const response = await fetch(`/launchpad/${encodeURIComponent(this.collectionValue)}/reserve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      this.#resetTurnstile()
      throw new Error(data.error || 'Failed to reserve inscription')
    }

    const data = await response.json()

    const m = data.metadata
    this.#inscriptionMetadata = {
      id: m.id,
      satpoint: m.satpoint,
      address: m.address,
      value: m.value,
      contentType: m.content_type,
      number: m.number
    }
  }

  async #loadMempoolFees() {
    this.#mempoolFees = await Mempool.feeEstimates()
  }

  async #loadUTXOs() {
    this.#utxos = await Wallet.fetchUTXOs()
  }

  #constructPurchaseTx() {
    if (!this.#inscriptionMetadata) throw new Error('Missing inscription metadata')
    const { selectedUTXOs, satsRequired } = this.#determineFeesAndUTXOs()

    const tx = new btc.Transaction()

    const [txid, vout, _offset] = this.#inscriptionMetadata.satpoint.split(':')

    const decodedInscriptionAddress = btc.Address().decode(this.#inscriptionMetadata.address)
    const inscriptionScript = btc.OutScript.encode(decodedInscriptionAddress)

    tx.addInput({
      txid: txid,
      index: parseInt(vout),
      sequence: 4294967293,
      witnessUtxo: { script: inscriptionScript, amount: BigInt(this.#inscriptionMetadata.value) },
    })

    let inputValue = BigInt(0)
    let inputIndex = 1
    let paymentWalletInputs = []

    for (const utxo of selectedUTXOs) {
      tx.addInput({
        txid: utxo.txid,
        index: utxo.vout,
        witnessUtxo: { script: Wallet.paymentScript, amount: BigInt(utxo.value) },
        redeemScript: Wallet.paymentRedeemScript,
        witnessScript: Wallet.paymentWitnessScript,
        tapInternalKey: Wallet.paymentTapInternalKey,
        sequence: 4294967293
      })

      inputValue += BigInt(utxo.value)

      paymentWalletInputs.push(inputIndex)
      inputIndex += 1
    }

    const inscriptionValue = BigInt(this.#inscriptionMetadata.value)
    const inscriptionPaddingSats = inscriptionValue >= 330n ? inscriptionValue : 330n

    tx.addOutputAddress(Wallet.ordinalAddress.address, BigInt(inscriptionPaddingSats))
    tx.addOutputAddress(this.paymentAddressValue, BigInt(this.priceValue))

    const optionalPayments = this.#selectedOptionalPayments()
    for (const optionalPayment of optionalPayments) {
      tx.addOutputAddress(optionalPayment.address, BigInt(optionalPayment.amount))
    }

    const changeAmount = inputValue - BigInt(satsRequired)
    if (changeAmount >= PADDING) tx.addOutputAddress(Wallet.paymentAddress.address, changeAmount)

    const psbt = tx.toPSBT()
    const signInputs = { [ Wallet.paymentAddress.address ]: paymentWalletInputs }

    return { psbt, signInputs }
  }

  #selectedOptionalPayments() {
    const selected = []

    for (const checkbox of this.optionalPaymentTargets) {
      if (!checkbox.checked) continue
      selected.push(JSON.parse(checkbox.dataset.payment))
    }

    return selected
  }

  #determineFeesAndUTXOs() {
    let txSize = BASE_TX_SIZE

    const sellerAddress = this.sellerAddressValue
    if (!sellerAddress) throw new Error('Missing seller address')
    const inscriptionAddress = this.#inscriptionMetadata?.address ?? sellerAddress

    txSize += Wallet.calculateInputSize(inscriptionAddress)
    txSize += Wallet.calculateOutputSize(this.paymentAddressValue)
    txSize += Wallet.paymentUTXOOutputSize + Wallet.ordinalUTXOOutputSize

    const optionalPayments = this.#selectedOptionalPayments()

    for (const optionalPayment of optionalPayments) {
      txSize += Wallet.calculateOutputSize(optionalPayment.address)
    }

    let selectedUTXOs = []

    let networkFees = Math.ceil(txSize * this.#networkFeeRate)
    let totalAvailableSats = BigInt(0)

    const lowestInscriptionUtxoSize = Number(this.lowestInscriptionUtxoSizeValue)
    const additionalPaddingSats = this.#inscriptionMetadata
      ? Math.max(0, lowestInscriptionUtxoSize - Number(this.#inscriptionMetadata.value))
      : lowestInscriptionUtxoSize
    const optionalPaymentsSats = optionalPayments.reduce((sum, payment) => sum + payment.amount, 0)
    const baseRequiredSats = this.priceValue + additionalPaddingSats + optionalPaymentsSats

    let satsRequired = baseRequiredSats + networkFees

    if (totalAvailableSats < BigInt(satsRequired)) {
      for (const utxo of this.#utxos) {
        selectedUTXOs.push(utxo)
        totalAvailableSats += BigInt(utxo.value)

        txSize += Wallet.paymentUTXOInputSize
        networkFees = Math.ceil(txSize * this.#networkFeeRate)
        satsRequired = baseRequiredSats + networkFees

        if (totalAvailableSats >= BigInt(satsRequired)) break
      }
    }

    if (totalAvailableSats < BigInt(satsRequired)) throw new Error('Insufficient funds: Not enough available sats to complete the purchase')

    return { selectedUTXOs, networkFees, satsRequired }
  }

  get #networkFeeRate() {
    const raw = parseFloat(this.#mempoolFees["1"])
    const feeRate = (Math.floor(raw * 10) + 1) / 10

    return feeRate.toFixed(2)
  }

  #setPreparingState() {
    this.prepareButtonTarget.disabled = true
    this.prepareSpinnerTarget.classList.remove('button-spinner-hidden')
    this.prepareLabelTarget.textContent = 'Preparing…'
  }

  #setMintState() {
    this.prepareButtonTarget.classList.remove('show-on-connected')
    this.prepareButtonTarget.classList.add('hidden')

    this.mintButtonTarget.classList.remove('hidden', 'purchase-success')
    this.mintButtonTarget.classList.add('inline-flex')
    this.mintSpinnerTarget.classList.add('button-spinner-hidden')
    this.mintLabelTarget.textContent = 'Mint'
    this.successPanelTarget.classList.add('hidden')

    this.#syncMintButtonWithTurnstile()
  }

  #setPrepareState() {
    this.prepareButtonTarget.classList.remove('hidden')
    this.prepareButtonTarget.classList.add('show-on-connected')
    this.mintButtonTarget.classList.add('hidden')
    this.#resetPrepareButton()
  }

  #setMintingState() {
    this.mintButtonTarget.disabled = true
    this.mintSpinnerTarget.classList.remove('button-spinner-hidden')
    this.mintLabelTarget.textContent = 'Minting…'
  }

  #setSuccessState() {
    this.mintButtonTarget.disabled = true
    this.mintSpinnerTarget.classList.add('button-spinner-hidden')
    this.mintLabelTarget.textContent = 'Mint Completed'
    this.mintButtonTarget.classList.add('purchase-success')

    this.successPanelTarget.classList.remove('hidden')
    this.successLinkTarget.href = `https://mempool.space/tx/${this.txid}`
  }

  #resetPrepareButton() {
    this.prepareButtonTarget.disabled = false
    this.prepareSpinnerTarget.classList.add('button-spinner-hidden')
    this.prepareLabelTarget.textContent = 'Prepare Mint'
  }

  #resetMintButton() {
    this.#syncMintButtonWithTurnstile()
    this.mintSpinnerTarget.classList.add('button-spinner-hidden')
    this.mintLabelTarget.textContent = 'Mint'
    this.mintButtonTarget.classList.remove('purchase-success')
  }

  #disableForm() {
    this.formTarget.classList.add('opacity-50', 'pointer-events-none')
  }

  #enableForm() {
    this.formTarget.classList.remove('opacity-50', 'pointer-events-none')
  }

  #hideError() {
    this.errorPanelTarget.classList.add('hidden')
  }

  #showError({ title, error }) {
    const stack = error?.stack ? String(error.stack) : null
    if (stack) console.error(stack)
    else if (error) console.error(error)

    const message = error?.message ? String(error.message) : String(error)
    if (message === USER_REJECTED_SIGN_REQUEST_MESSAGE) return

    this.errorTitleTarget.textContent = title
    this.errorMessageTarget.textContent = message
    this.errorPanelTarget.classList.remove('hidden')
  }

  #resetTurnstile() {
    if (!this.hasTurnstileTarget) return

    window.turnstile?.reset()
    this.#turnstileToken = null
    this.#syncMintButtonWithTurnstile()
  }

  #attachTurnstileCallbacks() {
    window.launchpadTurnstileSuccess = (token) => {
      this.#turnstileToken = token
      this.#syncMintButtonWithTurnstile()
    }

    const clearToken = () => {
      this.#turnstileToken = null
      this.#syncMintButtonWithTurnstile()
    }

    window.launchpadTurnstileExpired = clearToken
    window.launchpadTurnstileError = clearToken
  }

  #detachTurnstileCallbacks() {
    delete window.launchpadTurnstileSuccess
    delete window.launchpadTurnstileExpired
    delete window.launchpadTurnstileError
  }

  #syncMintButtonWithTurnstile() {
    this.mintButtonTarget.disabled = this.hasTurnstileTarget && !this.#turnstileToken
  }
}
