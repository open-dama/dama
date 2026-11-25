-- When marketplace is on, default_buying_type must not stay legacy.
-- Prefer auction or reservation when that mode is enabled; empty when both modes are off.

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{default_buying_type}',
  to_jsonb(
    CASE
      WHEN COALESCE(value->>'auction_enabled', 'true') IN ('true', '1', 't') THEN 'auction'
      WHEN COALESCE(value->>'reservation_enabled', 'false') IN ('true', '1', 't') THEN 'reservation'
      ELSE ''
    END
  ),
  true
),
updated_at = NOW()
WHERE key = 'ad_pricing'
  AND COALESCE((value->>'marketplace_enabled')::boolean, false) = true
  AND COALESCE(NULLIF(trim(value->>'default_buying_type'), ''), 'legacy') IN ('', 'legacy');
