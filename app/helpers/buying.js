import { renderPage, renderView } from '../themes/theme.js'
import { assets } from '../../generated/assets.js'

export function renderBuyingHome({ config, collections }) {
  return renderPage({
    viewName: 'buying_home.html',
    vars: {
      title: 'Buying',
      assets,
      config,
      collections
    }
  })
}

export function renderBuyingCollection({ policy, parentInscription, recentOrders }) {
  return renderPage({
    viewName: 'buying_collection.html',
    vars: {
      title: policy.title,
      assets,
      collection: policy.policy,
      buy: {
        slug: policy.slug,
        title: policy.title,
        priceSats: policy.policy.price_sats,
        destinationAddress: policy.destinationAddress,
        explicitFeeRate: policy.explicitFeeRate
      },
      parentInscription,
      recentSales: recentOrders
    }
  })
}

export function renderBuyingActivity({ orders }) {
  return renderView({
    viewName: 'buying_activity.html',
    vars: {
      orders
    }
  })
}
