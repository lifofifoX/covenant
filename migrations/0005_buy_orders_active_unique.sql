CREATE UNIQUE INDEX IF NOT EXISTS idx_buy_orders_active_unique_inscription_id
  ON buy_orders(inscription_id)
  WHERE status IN ('pending', 'confirmed');
