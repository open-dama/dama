-- Phase C: lobby takeover package flag + seeded reservation package.
-- Extends existing AdPackage catalog (no parallel marketplace).
-- takeover campaigns stay on placement=lobby; clients treat them as soft interrupt inventory.

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{packages}',
  COALESCE(
    (
      SELECT jsonb_agg(
        elem
        || jsonb_build_object(
          'lobby_takeover', COALESCE(
            (elem->>'lobby_takeover')::boolean,
            lower(trim(elem->>'code')) = 'lobby_takeover'
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

-- Seed lobby_takeover package when missing (reservation + exclusive + lobby placement).
UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{packages}',
  COALESCE(value->'packages', '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'code', 'lobby_takeover',
      'title', 'Lobby takeover',
      'blurb', 'Exclusive lobby soft interrupt for finals weekends and premium events. Higher floor. One brand at a time.',
      'buying_type', 'reservation',
      'fixed_cpm', 25,
      'flight_fee', 0,
      'min_tier', '',
      'placement', 'lobby',
      'enabled', true,
      'sort_order', 40,
      'exclusive', true,
      'exclusive_category', 'lobby_takeover',
      'lobby_takeover', true
    )
  )
),
updated_at = NOW()
WHERE key = 'ad_packages'
  AND value ? 'packages'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(value->'packages', '[]'::jsonb)) AS elem
    WHERE lower(trim(elem->>'code')) = 'lobby_takeover'
  );

UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'package_lobby_takeover_label',
    COALESCE(NULLIF(trim(value->>'package_lobby_takeover_label'), ''), 'Lobby takeover'),
  'package_lobby_takeover_blurb',
    COALESCE(
      NULLIF(trim(value->>'package_lobby_takeover_blurb'), ''),
      'Premium lobby soft interrupt inventory. Pair with exclusive reservation for event weekends.'
    )
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{progression}',
  COALESCE(value->'progression', '{}'::jsonb)
  || jsonb_build_object(
    'package_lobby_takeover_label',
      COALESCE(NULLIF(trim(value->'progression'->>'package_lobby_takeover_label'), ''), 'Lobby takeover'),
    'package_lobby_takeover_blurb',
      COALESCE(
        NULLIF(trim(value->'progression'->>'package_lobby_takeover_blurb'), ''),
        'When on, this lobby package is soft-interrupt inventory (Phase C). Prefer exclusive reservation.'
      )
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';
