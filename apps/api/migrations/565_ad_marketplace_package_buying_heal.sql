-- When marketplace is on, package buying_type must not stay legacy (packages are auction/reservation).

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{packages}',
  COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN COALESCE(NULLIF(trim(p->>'buying_type'), ''), 'legacy') IN ('', 'legacy')
            THEN jsonb_set(p, '{buying_type}', '"reservation"', true)
          ELSE p
        END
        ORDER BY COALESCE((p->>'sort_order')::int, 0), COALESCE(p->>'code', '')
      )
      FROM jsonb_array_elements(COALESCE(value->'packages', '[]'::jsonb)) AS p
    ),
    '[]'::jsonb
  ),
  true
),
updated_at = NOW()
WHERE key = 'ad_packages'
  AND EXISTS (
    SELECT 1
    FROM platform_settings ps
    WHERE ps.key = 'ad_pricing'
      AND COALESCE((ps.value->>'marketplace_enabled')::boolean, false) = true
  )
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(value->'packages', '[]'::jsonb)) AS p
    WHERE COALESCE(NULLIF(trim(p->>'buying_type'), ''), 'legacy') IN ('', 'legacy')
  );
