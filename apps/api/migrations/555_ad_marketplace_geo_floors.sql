-- Geo floor CPM (Ethiopia vs global). Additive; keeps existing floor_cpm as fallback.
-- Aligns media floors with create-fee geo rails so rates float by market.

UPDATE platform_settings
SET value = value
  || jsonb_build_object(
    'floor_cpm_ethiopia', COALESCE(
      NULLIF((NULLIF(trim(value->>'floor_cpm_ethiopia'), ''))::numeric, 0),
      NULLIF((NULLIF(trim(value->>'floor_cpm'), ''))::numeric, 0),
      NULLIF((NULLIF(trim(value->>'impression_unit_cost'), ''))::numeric, 0),
      0.01
    ),
    'floor_cpm_global', COALESCE(
      NULLIF((NULLIF(trim(value->>'floor_cpm_global'), ''))::numeric, 0),
      NULLIF((NULLIF(trim(value->>'floor_cpm'), ''))::numeric, 0),
      NULLIF((NULLIF(trim(value->>'impression_unit_cost'), ''))::numeric, 0),
      0.01
    )
  ),
  updated_at = NOW()
WHERE key = 'ad_pricing';

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{progression}',
  COALESCE(value->'progression', '{}'::jsonb)
  || jsonb_build_object(
    'floor_cpm_ethiopia_label', COALESCE(NULLIF(trim(value->'progression'->>'floor_cpm_ethiopia_label'), ''), 'Floor CPM (Ethiopia)'),
    'floor_cpm_ethiopia_blurb', COALESCE(NULLIF(trim(value->'progression'->>'floor_cpm_ethiopia_blurb'), ''), 'Minimum price per 1,000 views for Ethiopia campaigns. Peak hours and busy inventory can still raise this.'),
    'floor_cpm_global_label', COALESCE(NULLIF(trim(value->'progression'->>'floor_cpm_global_label'), ''), 'Floor CPM (Global)'),
    'floor_cpm_global_blurb', COALESCE(NULLIF(trim(value->'progression'->>'floor_cpm_global_blurb'), ''), 'Minimum price per 1,000 views for campaigns outside Ethiopia. Peak hours and busy inventory can still raise this.')
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';
