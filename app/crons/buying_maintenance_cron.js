import { listPendingBuyOrders, setBuyOrderStatus } from '../models/db/buy_orders.js'
import { Mempool } from '../models/mempool.js'
import { refreshFundingWalletState } from '../utils/funding_wallet.js'
import { safeErrorMessage } from '../utils/logging.js'

async function processPendingBuyOrder({ db, order }) {
  try {
    let tx = null
    try {
      tx = await Mempool.tx(order.txid)
    } catch {
      // Electrs can fail transiently; keep the order pending and retry later.
    }

    if (tx) {
      if (tx.status?.confirmed) {
        await setBuyOrderStatus({ db, id: order.id, status: 'confirmed' })
      }
      return
    }

    const broadcastResult = await Mempool.broadcastTx(order.signed_tx)
    if (broadcastResult === true) return

    const errorText = String(broadcastResult ?? '')
    const match = errorText.match(/^HTTP\s+(\d{3})\b/)
    const status = match ? Number(match[1]) : null

    if (status === 400) {
      await setBuyOrderStatus({ db, id: order.id, status: 'failed' })
    }
  } catch (error) {
    console.error('processPendingBuyOrder failed', order.id, error)
  }
}

export async function reconcileBuyOrders({ env }) {
  const db = env.DB

  const startedAt = Date.now()
  const batchSize = 200
  const maxOrdersPerRun = 5000
  const maxRunMs = 25_000
  const concurrency = 8

  let afterId = null
  let processed = 0

  while (true) {
    if (Date.now() - startedAt > maxRunMs) break
    if (processed >= maxOrdersPerRun) break

    const remaining = maxOrdersPerRun - processed
    const limit = Math.min(batchSize, remaining)
    const orders = await listPendingBuyOrders({ db, limit, afterId })
    if (orders.length === 0) break

    for (let i = 0; i < orders.length; i += concurrency) {
      const promises = []

      for (let j = i; j < Math.min(i + concurrency, orders.length); j++) {
        promises.push(processPendingBuyOrder({ db, order: orders[j] }))
      }

      await Promise.all(promises)

      processed += promises.length
      if (Date.now() - startedAt > maxRunMs) break
    }

    afterId = orders[orders.length - 1].id
  }
}

export async function buyingMaintenanceCron({ env }) {
  const results = await Promise.allSettled([refreshFundingWalletState(env), reconcileBuyOrders({ env })])

  if (results[0].status === 'rejected') {
    console.error('refreshFundingWalletState failed', safeErrorMessage(results[0].reason))
  }

  if (results[1].status === 'rejected') {
    console.error('reconcileBuyOrders failed', safeErrorMessage(results[1].reason))
  }
}

export function runBuyingMaintenanceCron(event, env, ctx) {
  ctx.waitUntil(buyingMaintenanceCron({ env }))
}
