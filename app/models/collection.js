import { CONFIG, POLICY } from '../config.js'
import { Inscription } from './inscription.js'
import {
  countCollectionAvailable,
  ensureInscriptionMetadata,
  getAvailableInscriptionMetadata,
  getInscriptionMetadata,
  listCollectionAvailablePage
} from './db/inscriptions.js'

export class Collection {
  static lookup(slug) {
    const policy = POLICY.selling.find((collectionPolicy) => collectionPolicy.slug === slug)
    if (!policy) throw new Error(`Missing collection policy for slug: ${slug}`)

    return new Collection({ policy })
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

  optionalPayments() {
    return Array.isArray(this.policy.optional_payments) ? this.policy.optional_payments : []
  }

  get metadataInscriptionId() {
    const id = this.policy.gallery_inscription_id ?? this.policy.parent_inscription_id ?? this.policy.inscription_ids[0]
    if (!id) throw new Error(`Missing metadata inscription id for collection: ${this.slug}`)

    return id
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

  async parentInscription({ db }) {
    if (!this.policy.parent_inscription_id && !this.policy.gallery_inscription_id) return null
    return this.metadataInscription({ db })
  }

  async availableCount({ db }) {
    return await countCollectionAvailable({ db, collectionSlug: this.slug })
  }

  async listAvailablePage({ db, page }) {
    const pageNumber = Number.parseInt(page ?? '1', 10)
    const pageSafe = Math.max(1, pageNumber || 1)

    const offset = (pageSafe - 1) * CONFIG.page_size
    const metas = await listCollectionAvailablePage({ db, collectionSlug: this.slug, limit: CONFIG.page_size, offset })
    const inscriptions = metas.map((metadata) => new Inscription({ metadata }))

    const totalCount = await this.availableCount({ db })
    const totalPages = Math.max(1, Math.ceil(totalCount / CONFIG.page_size))
    const nextPage = pageSafe < totalPages ? String(pageSafe + 1) : null
    const prevPage = pageSafe > 1 ? String(pageSafe - 1) : null

    return { inscriptions, nextPage, prevPage, page: String(pageSafe), totalPages }
  }

  async loadInscription({ db, inscriptionId }) {
    const metadata = await getAvailableInscriptionMetadata({ db, collectionSlug: this.slug, inscriptionId })
    if (!metadata) return null

    return new Inscription({ metadata })
  }
}
