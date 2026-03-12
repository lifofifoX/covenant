CREATE TABLE IF NOT EXISTS launchpad_whitelist (
  collection_slug TEXT NOT NULL,
  address_normalized TEXT NOT NULL,
  max_mints INTEGER,
  source_group TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (collection_slug, address_normalized)
);

CREATE INDEX IF NOT EXISTS idx_launchpad_whitelist_collection
  ON launchpad_whitelist (collection_slug);

CREATE INDEX IF NOT EXISTS idx_launchpad_whitelist_address
  ON launchpad_whitelist (address_normalized);
