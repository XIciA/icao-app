-- Android-only temporary verification product. No Apple channel mapping is added.
-- Fulfillment snapshots the current weekly AI rule on the order as usual.
INSERT INTO "commerce_products" (
  "product_key", "display_name", "duration_days", "base_price_cny_fen",
  "ai_point_rule_version", "ai_point_batch_count", "ai_point_batch_interval_days", "ai_points_per_batch"
) VALUES ('membership_1d_v1', '1天会员', 1, 100, 'ai-weekly-v1', 1, 7, 500);
