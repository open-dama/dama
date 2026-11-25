-- Heal Growth tier package unlock + publisher marketplace clarity (additive).
-- Growth packages (home_spotlight, live_board_boost) use min_tier=growth; unlock_packages must match.
-- Does not change legacy create-fee or flat impression_unit_cost math.

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{tiers}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN lower(trim(t->>'code')) = 'growth'
          THEN t || jsonb_build_object(
            'unlock_packages', true,
            'blurb', COALESCE(
              NULLIF(trim(t->>'blurb'), ''),
              'For growing brands. Unlocks reservation, home and live packages, and higher reach.'
            )
          )
        WHEN lower(trim(t->>'code')) = 'enterprise'
          THEN t || jsonb_build_object(
            'blurb', COALESCE(
              NULLIF(trim(t->>'blurb'), ''),
              'For large advertisers. Tournament packages, reservation, and priority inventory.'
            )
          )
        ELSE t
      END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(value->'tiers', '[]'::jsonb)) AS t
  )
),
updated_at = NOW()
WHERE key = 'ad_pricing'
  AND value ? 'tiers'
  AND jsonb_typeof(value->'tiers') = 'array';

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'marketplace_fields_locked_blurb', COALESCE(
    NULLIF(trim(value->>'marketplace_fields_locked_blurb'), ''),
    'Buying type, bid or reserved rate, package, and agency are set when you create the campaign and cannot be changed later. Create a new campaign to choose different buying options.'
  ),
  'detail_marketplace_title', COALESCE(
    NULLIF(trim(value->>'detail_marketplace_title'), ''),
    'Buying summary'
  ),
  'detail_rate_suffix', COALESCE(
    NULLIF(trim(value->>'detail_rate_suffix'), ''),
    'per view'
  ),
  'detail_standard_buying_label', COALESCE(
    NULLIF(trim(value->>'detail_standard_buying_label'), ''),
    'Standard'
  )
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';
