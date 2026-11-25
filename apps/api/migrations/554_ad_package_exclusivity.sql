-- Package category exclusivity (sponsorship): at most one winner per exclusive bucket at serve time.
-- Additive; existing packages keep delivering. Public titles/blurbs only.

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{packages}',
  COALESCE(
    (
      SELECT jsonb_agg(
        elem
        || jsonb_build_object(
          'exclusive', COALESCE(
            (elem->>'exclusive')::boolean,
            lower(trim(elem->>'code')) = 'tournament_season'
          ),
          'exclusive_category', COALESCE(
            NULLIF(trim(elem->>'exclusive_category'), ''),
            CASE
              WHEN lower(trim(elem->>'code')) = 'tournament_season' THEN 'tournament'
              ELSE ''
            END
          )
        )
        ORDER BY COALESCE((elem->>'sort_order')::int, 0), trim(elem->>'code')
      )
      FROM jsonb_array_elements(COALESCE(value->'packages', '[]'::jsonb)) AS elem
    ),
    '[]'::jsonb
  )
),
updated_at = NOW()
WHERE key = 'ad_packages'
  AND value ? 'packages';

UPDATE platform_settings
SET value = value
  || jsonb_build_object(
    'package_exclusive_label', COALESCE(NULLIF(trim(value->>'package_exclusive_label'), ''), 'Exclusive package'),
    'package_exclusive_blurb', COALESCE(NULLIF(trim(value->>'package_exclusive_blurb'), ''), 'Only one brand wins this package slot at a time. Highest bid or reserved rate wins when others compete.'),
    'err_package_exclusive_taken', COALESCE(NULLIF(trim(value->>'err_package_exclusive_taken'), ''), 'This exclusive package is already held by another active campaign')
  ),
  updated_at = NOW()
WHERE key = 'ad_runtime_chrome';

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{progression}',
  COALESCE(value->'progression', '{}'::jsonb)
  || jsonb_build_object(
    'package_exclusive_label', COALESCE(NULLIF(trim(value->'progression'->>'package_exclusive_label'), ''), 'Exclusive'),
    'package_exclusive_category_label', COALESCE(NULLIF(trim(value->'progression'->>'package_exclusive_category_label'), ''), 'Exclusive category'),
    'package_exclusive_blurb', COALESCE(NULLIF(trim(value->'progression'->>'package_exclusive_blurb'), ''), 'When on, only one active campaign in this category serves. Use for tournament or category sponsorship.')
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';
