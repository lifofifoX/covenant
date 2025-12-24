export class Inscription {
  constructor({ metadata }) {
    this.metadata = metadata
  }

  get id() {
    return this.metadata.id
  }

  get number() {
    return this.metadata.number
  }

  get title() {
    return this.metadata.properties?.attributes?.title ?? `Inscription #${this.metadata.number}`
  }

  get contentType() {
    return this.metadata.effective_content_type ?? this.metadata.content_type ?? ''
  }

  get isImage() {
    return this.contentType.startsWith('image/')
  }

  get contentUrl() {
    return `https://ordinals.com/content/${this.id}`
  }

  get previewUrl() {
    return `https://ordinals.com/preview/${this.id}`
  }

  get parents() {
    return this.metadata.parents ?? []
  }

  get charms() {
    return this.metadata.charms ?? []
  }

  get charmIcons() {
    const map = {
      burned: '🔥',
      coin: '🪙',
      cursed: '👹',
      epic: '🪻',
      legendary: '🌝',
      lost: '🤔',
      mythic: '🎃',
      nineball: '9️⃣',
      palindrome: '🦋',
      rare: '🧿',
      reinscription: '♻️',
      unbound: '🔓',
      uncommon: '🌱',
      vindicated: '❤️‍🔥'
    }

    return (this.charms ?? []).map((charm) => map[charm]).filter(Boolean)
  }

  get sat() {
    return this.metadata.sat
  }

  get timestamp() {
    return this.metadata.timestamp
  }

  get childCount() {
    return this.metadata.child_count
  }

  get galleryCount() {
    return (this.metadata.properties?.gallery ?? []).length
  }

  get isSealed() {
    return this.metadata.charms.includes('burned')
  }

  get locationTxid() {
    return this.satpoint.split(':')[0]
  }

  get locationVout() {
    return parseInt(this.satpoint.split(':')[1])
  }

  get satpoint() {
    return this.metadata.satpoint
  }
}
