-- Phase B: lobby soft interstitial after idle dwell (opt-in).
-- Additive. Does not change Phase A tile rotate or in-match break timing.
-- Default OFF so play conversion stays protected until admin enables.

UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'lobby_soft_interstitial_enabled',
    COALESCE(
      CASE
        WHEN lower(COALESCE(trim(value->>'lobby_soft_interstitial_enabled'), '')) IN ('1', 'true', 'yes', 'on')
          THEN 'true'
        WHEN lower(COALESCE(trim(value->>'lobby_soft_interstitial_enabled'), '')) IN ('0', 'false', 'no', 'off')
          THEN 'false'
        ELSE NULL
      END,
      'false'
    ),
  'lobby_idle_threshold_seconds',
    COALESCE(
      NULLIF((NULLIF(trim(value->>'lobby_idle_threshold_seconds'), ''))::int, 0),
      90
    ),
  'lobby_idle_threshold_min',
    COALESCE(
      NULLIF((NULLIF(trim(value->>'lobby_idle_threshold_min'), ''))::int, 0),
      30
    ),
  'lobby_idle_threshold_max',
    COALESCE(
      NULLIF((NULLIF(trim(value->>'lobby_idle_threshold_max'), ''))::int, 0),
      600
    )
),
updated_at = NOW()
WHERE key = 'ad_playback';

UPDATE platform_settings
SET value = jsonb_set(
  jsonb_set(
    value,
    '{lobby_idle_threshold_seconds}',
    to_jsonb(
      GREATEST(
        COALESCE((value->>'lobby_idle_threshold_min')::int, 30),
        LEAST(
          COALESCE((value->>'lobby_idle_threshold_seconds')::int, 90),
          COALESCE((value->>'lobby_idle_threshold_max')::int, 600)
        )
      )
    )
  ),
  '{lobby_soft_interstitial_enabled}',
  to_jsonb(
    CASE
      WHEN lower(COALESCE(trim(value->>'lobby_soft_interstitial_enabled'), 'false')) IN ('1', 'true', 'yes', 'on')
        THEN true
      ELSE false
    END
  )
),
updated_at = NOW()
WHERE key = 'ad_playback';

UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'lobby_soft_section_title',
    COALESCE(NULLIF(trim(value->>'lobby_soft_section_title'), ''), 'Lobby soft interstitial'),
  'lobby_soft_section_blurb',
    COALESCE(
      NULLIF(trim(value->>'lobby_soft_section_blurb'), ''),
      'After the player lingers on the home lobby with no critical flow open, show one soft full-screen ad. Off by default. Never during queue, invite, match start, or wallet/KYC.'
    ),
  'lobby_soft_enabled_label',
    COALESCE(NULLIF(trim(value->>'lobby_soft_enabled_label'), ''), 'Lobby soft interstitial'),
  'lobby_idle_threshold_label',
    COALESCE(NULLIF(trim(value->>'lobby_idle_threshold_label'), ''), 'Lobby idle threshold (seconds)')
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';
