-- Clamp default_buying_type to enabled marketplace modes.
-- Both auction and reservation off => empty (never force auction).

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{default_buying_type}',
  to_jsonb(
    CASE
      WHEN COALESCE(value->>'auction_enabled', 'false') NOT IN ('true', '1', 't')
        AND COALESCE(value->>'reservation_enabled', 'false') NOT IN ('true', '1', 't')
        THEN ''
      WHEN COALESCE(value->>'auction_enabled', 'false') IN ('true', '1', 't')
        AND COALESCE(value->>'reservation_enabled', 'false') NOT IN ('true', '1', 't')
        THEN 'auction'
      WHEN COALESCE(value->>'reservation_enabled', 'false') IN ('true', '1', 't')
        AND COALESCE(value->>'auction_enabled', 'false') NOT IN ('true', '1', 't')
        THEN 'reservation'
      WHEN COALESCE(NULLIF(trim(value->>'default_buying_type'), ''), 'legacy') IN ('', 'legacy')
        THEN 'auction'
      WHEN trim(value->>'default_buying_type') = 'reservation'
        THEN 'reservation'
      WHEN trim(value->>'default_buying_type') = 'auction'
        THEN 'auction'
      ELSE 'auction'
    END
  ),
  true
),
updated_at = NOW()
WHERE key = 'ad_pricing'
  AND COALESCE((value->>'marketplace_enabled')::boolean, false) = true;
