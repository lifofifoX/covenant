import { themes } from '../../generated/themes.js'
import { CONFIG } from '../config.js'
import * as btc from '@scure/btc-signer'

function formatSats(amount) {
  return `${btc.Decimal.encode(BigInt(amount))} BTC`
}

function currentTheme() {
  return themes[CONFIG.theme] ?? themes.default
}

function makeInclude({ theme, baseVars }) {
  return (name, vars = {}) => {
    const viewName = name.endsWith('.html') ? name : `${name}.html`
    const view = theme[viewName]
    if (!view) throw new Error(`Missing view: ${viewName}`)
    const nextVars = { ...baseVars, ...vars, CONFIG }
    return view({ ...nextVars, include: makeInclude({ theme, baseVars: nextVars }) })
  }
}

export function renderPage({ viewName, vars }) {
  const theme = currentTheme()
  const layout = theme['layout.html']
  const view = theme[viewName]
  if (!layout) throw new Error('Missing layout.html')
  if (!view) throw new Error(`Missing view: ${viewName}`)

  const viewVars = { ...vars, CONFIG, formatSats }
  const include = makeInclude({ theme, baseVars: viewVars })
  const body = view({ ...viewVars, include })
  return layout({ ...viewVars, body, include })
}

export function renderView({ viewName, vars }) {
  const theme = currentTheme()
  const view = theme[viewName]
  if (!view) throw new Error(`Missing view: ${viewName}`)

  const viewVars = { ...vars, CONFIG, formatSats }
  const include = makeInclude({ theme, baseVars: viewVars })
  return view({ ...viewVars, include })
}

export function renderCard({ vars }) {
  const theme = currentTheme()
  const card = theme['partials/inscription-card.html']
  if (!card) throw new Error('Missing partials/inscription-card.html')
  return card({ ...vars, CONFIG, formatSats })
}
