export { LaunchpadReservationWorker } from './worker.js'

export default {
  fetch() {
    return new Response('Not found', { status: 404 })
  }
}
