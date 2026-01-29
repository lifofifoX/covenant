import { Hono } from 'hono'
import { homeController } from '../../controllers/home_controller.js'
import { policyController } from '../../controllers/policy_controller.js'
import { collectionController } from '../../controllers/collection_controller.js'
import { showCollectionInscriptionController } from '../../controllers/inscription_controller.js'
import { activityController } from '../../controllers/activity_controller.js'
import { executeSellController } from '../../controllers/sell_controller.js'
import { launchpadReserveController } from '../../controllers/launchpad_reserve_controller.js'
import { launchpadMintController } from '../../controllers/launchpad_mint_controller.js'
import { launchpadSalesController } from '../../controllers/launchpad_sales_controller.js'
import { launchpadProgressController } from '../../controllers/launchpad_progress_controller.js'
import { runSyncCollectionsCron } from '../../crons/sync_collections_cron.js'
import { runOrdersCron } from '../../crons/orders_cron.js'

export { LaunchpadReservationWorker } from '../launchpad/worker.js'

const app = new Hono()

app.onError((err, c) => {
  console.error(err?.message ? String(err.message) : String(err))
  return c.text('Internal Server Error', 500)
})

app.get('/', homeController)
app.get('/policy', policyController)
app.get('/activity', activityController)
app.post('/sell/:slug', executeSellController)
app.post('/launchpad/:slug/reserve', launchpadReserveController)
app.post('/launchpad/:slug/mint', launchpadMintController)
app.get('/launchpad/:slug/sales', launchpadSalesController)
app.get('/launchpad/:slug/progress', launchpadProgressController)
app.get('/:collection', collectionController)
app.get('/:collection/:id', showCollectionInscriptionController)

export default {
  fetch: app.fetch,
  scheduled: (event, env, ctx) => {
    switch (event?.cron) {
      case '*/5 * * * *':
        runOrdersCron(event, env, ctx)
        return
      case '*/10 * * * *':
        runSyncCollectionsCron(event, env, ctx)
        return
      default:
        runOrdersCron(event, env, ctx)
        runSyncCollectionsCron(event, env, ctx)
        return
    }
  }
}
