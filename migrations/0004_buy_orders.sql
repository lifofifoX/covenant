CREATE TABLE IF NOT EXISTS buy_orders (
  id TEXT PRIMARY KEY,
  collection_slug TEXT NOT NULL,
  inscription_id TEXT NOT NULL,
  status TEXT NOT NULL,
  txid TEXT NOT NULL,
  signed_tx TEXT NOT NULL,
  extra_details TEXT NOT NULL,
  seller_ordinal_address TEXT NOT NULL,
  seller_payment_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  price_sats INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_buy_orders_inscription_id ON buy_orders(inscription_id);
CREATE INDEX IF NOT EXISTS idx_buy_orders_collection_slug ON buy_orders(collection_slug);
CREATE INDEX IF NOT EXISTS idx_buy_orders_status_collection_created_at ON buy_orders(status, collection_slug, created_at);
CREATE INDEX IF NOT EXISTS idx_buy_orders_status_id ON buy_orders(status, id);
CREATE INDEX IF NOT EXISTS idx_buy_orders_created_at ON buy_orders(created_at DESC);
