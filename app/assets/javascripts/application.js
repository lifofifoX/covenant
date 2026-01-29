import '@hotwired/turbo'

import Wallet from './models/wallet.js'
window.Wallet = new Wallet()

import { CONFIG } from '../../config.js'
window.CONFIG = CONFIG

import { Application } from '@hotwired/stimulus'
const application = Application.start()

import ImageController from './controllers/image_controller.js'
import BodyClassController from './controllers/body_class_controller.js'
import DropdownController from './controllers/dropdown_controller.js'
import WalletController from './controllers/wallet_controller.js'
import InscriptionController from './controllers/inscription_controller.js'
import UsdController from './controllers/usd_controller.js'
import StickyPurchaseController from './controllers/sticky_purchase_controller.js'
import MintController from './controllers/mint_controller.js'
import FrameRefreshController from './controllers/frame_refresh_controller.js'

application.register('image', ImageController)
application.register('body-class', BodyClassController)
application.register('dropdown', DropdownController)
application.register('wallet', WalletController)
application.register('inscription', InscriptionController)
application.register('usd', UsdController)
application.register('sticky-purchase', StickyPurchaseController)
application.register('mint', MintController)
application.register('frame-refresh', FrameRefreshController)

window.CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 4
})
