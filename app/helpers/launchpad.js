import { renderPage, renderView } from '../themes/theme.js'
import { assets } from '../../generated/assets.js'

function resolveLaunchpadTotal({ collection, parentInscription }) {
  if (collection.gallery_inscription_id) {
    return parentInscription?.galleryCount ?? 0
  }

  if (collection.parent_inscription_id) {
    return parentInscription?.childCount ?? 0
  }

  if (Array.isArray(collection.inscription_ids)) {
    return collection.inscription_ids.length
  }

  return 0
}

function buildLaunchpadSupply({ collection, parentInscription, availableCount, pendingCount = 0 }) {
  const total = resolveLaunchpadTotal({ collection, parentInscription })

  const available = availableCount ?? 0
  const pendingSafe = pendingCount ?? 0
  const unavailable = total - available

  const progress = total > 0 ? Math.round((unavailable / total) * 100) : 0
  const isSoldOut = available <= 0

  return {
    total,
    pending: pendingSafe,
    available,
    unavailable,
    minted: unavailable,
    mintable: available,
    progress,
    isSoldOut,
    hasMintable: available > 0
  }
}

export function renderLaunchpad({ config, launchpad, collection, parentInscription, recentSales, availableCount, pendingCount, whitelistStatus }) {
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
      supply: buildLaunchpadSupply({ collection: collection.policy, parentInscription, availableCount, pendingCount }),
      whitelistStatus: whitelistStatus ?? null
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

export function renderLaunchpadProgress({ collection, parentInscription, availableCount, pendingCount }) {
  return renderView({
    viewName: 'launchpad_progress.html',
    vars: {
      collection: collection.policy,
      parentInscription,
      supply: buildLaunchpadSupply({ collection: collection.policy, parentInscription, availableCount, pendingCount })
    }
  })
}
