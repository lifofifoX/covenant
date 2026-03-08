import { POLICY } from '../config.js'
import { Inscription } from './inscription.js'
import { ensureInscriptionMetadata, getInscriptionMetadata } from './db/inscriptions.js'
import { resolveMetadataInscriptionId } from './policy_matcher.js'

export class BuyPolicy {
  static listPolicies() {
    return Array.isArray(POLICY.buying) ? POLICY.buying : []
  }

  static lookup(slug) {
    const policy = BuyPolicy.listPolicies().find((candidate) => candidate.slug === slug)
    if (!policy) throw new Error(`Missing buy policy for slug: ${slug}`)

    return new BuyPolicy({ policy })
  }

  constructor({ policy }) {
    this.policy = policy
  }

  get slug() {
    return this.policy.slug
  }

  get title() {
    return this.policy.title
  }

  get destinationAddress() {
    return this.policy.destination_address
  }

  get explicitFeeRate() {
    return this.policy.explicit_fee_rate ?? null
  }

  get metadataInscriptionId() {
    return resolveMetadataInscriptionId(this.policy)
  }

  async metadataInscription({ db }) {
    let metadata = await getInscriptionMetadata({ db, inscriptionId: this.metadataInscriptionId })
    if (!metadata) {
      const metas = await ensureInscriptionMetadata({ db, inscriptionIds: [this.metadataInscriptionId] })
      metadata = metas.get(this.metadataInscriptionId) ?? null
    }
    if (!metadata) throw new Error(`Missing metadata for inscription: ${this.metadataInscriptionId}`)

    return new Inscription({ metadata })
  }
}
