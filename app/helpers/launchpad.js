import { renderPage, renderView } from '../themes/theme.js'
import { assets } from '../../generated/assets.js'

function buildLaunchpadSupply({ totalSupply, soldCount, pendingCount = 0 }) {
  const availableCount = Math.max(0, totalSupply - soldCount)
  const pendingSafe = Math.max(0, pendingCount)
  const mintableCount = Math.max(0, totalSupply - soldCount - pendingSafe)
  const progress = totalSupply > 0 ? Math.round((soldCount / totalSupply) * 100) : 0
  const isSoldOut = availableCount <= 0

  return {
    total: totalSupply,
    sold: soldCount,
    pending: pendingSafe,
    available: availableCount,
    mintable: mintableCount,
    progress,
    isSoldOut,
    hasMintable: mintableCount > 0
  }
}

export function renderLaunchpad({ config, launchpad, collection, parentInscription, recentSales, totalSupply, soldCount, pendingCount }) {
  return renderPage({
    viewName: 'launchpad.html',
    vars: {
      title: collection.title,
      assets,
      config,
      launchpad,
      collection: collection.policy,
      parentInscription,
      recentSales,
      supply: buildLaunchpadSupply({ totalSupply, soldCount, pendingCount })
    }
  })
}

export function renderLaunchpadSales({ recentSales }) {
  return renderView({
    viewName: 'launchpad_sales.html',
    vars: {
      recentSales
    }
  })
}

export function renderLaunchpadProgress({ collection, parentInscription, totalSupply, soldCount, pendingCount }) {
  return renderView({
    viewName: 'launchpad_progress.html',
    vars: {
      collection: collection.policy,
      parentInscription,
      supply: buildLaunchpadSupply({ totalSupply, soldCount, pendingCount })
    }
  })
}
