-- Phase A: lobby tile rotation (separate from in-match) + cross-placement frequency caps.
-- Additive. Does not change in-match first_show / default_interval behavior.
-- Idempotent heals for ad_playback + ad_runtime_chrome + impression viewer indexes.

-- Viewer frequency lookups (lobby rotate + cross caps).
CREATE INDEX IF NOT EXISTS idx_ad_impression_events_viewer_created
  ON ad_impression_events (viewer_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_impression_events_viewer_campaign_created
  ON ad_impression_events (viewer_key, campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_impression_events_viewer_placement_created
  ON ad_impression_events (viewer_key, placement, created_at DESC);

-- ad_playback: lobby rotate + frequency policy (0 on a cap = that cap disabled).
UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'lobby_rotate_enabled',
    COALESCE(NULLIF(trim(value->>'lobby_rotate_enabled'), ''), 'true'),
  'lobby_rotate_interval_seconds',
    COALESCE(
      NULLIF((NULLIF(trim(value->>'lobby_rotate_interval_seconds'), ''))::int, 0),
      180
    ),
  'lobby_rotate_interval_min',
    COALESCE(
      NULLIF((NULLIF(trim(value->>'lobby_rotate_interval_min'), ''))::int, 0),
      60
    ),
  'lobby_rotate_interval_max',
    COALESCE(
      NULLIF((NULLIF(trim(value->>'lobby_rotate_interval_max'), ''))::int, 0),
      1800
    ),
  'freq_cap_campaign_per_hour',
    COALESCE(
      (NULLIF(trim(value->>'freq_cap_campaign_per_hour'), ''))::int,
      3
    ),
  'freq_cap_campaign_per_day',
    COALESCE(
      (NULLIF(trim(value->>'freq_cap_campaign_per_day'), ''))::int,
      12
    ),
  'freq_cap_placement_per_hour',
    COALESCE(
      (NULLIF(trim(value->>'freq_cap_placement_per_hour'), ''))::int,
      6
    ),
  'freq_cap_placement_per_day',
    COALESCE(
      (NULLIF(trim(value->>'freq_cap_placement_per_day'), ''))::int,
      24
    ),
  'freq_cap_min_gap_seconds',
    COALESCE(
      (NULLIF(trim(value->>'freq_cap_min_gap_seconds'), ''))::int,
      60
    )
),
updated_at = NOW()
WHERE key = 'ad_playback';

-- Clamp lobby rotate interval into its bounds after heal.
UPDATE platform_settings
SET value = jsonb_set(
  jsonb_set(
    value,
    '{lobby_rotate_interval_seconds}',
    to_jsonb(
      GREATEST(
        COALESCE((value->>'lobby_rotate_interval_min')::int, 60),
        LEAST(
          COALESCE((value->>'lobby_rotate_interval_seconds')::int, 180),
          COALESCE((value->>'lobby_rotate_interval_max')::int, 1800)
        )
      )
    )
  ),
  '{lobby_rotate_enabled}',
  to_jsonb(
    CASE
      WHEN lower(COALESCE(trim(value->>'lobby_rotate_enabled'), 'true')) IN ('0', 'false', 'no', 'off')
        THEN false
      ELSE true
    END
  )
),
updated_at = NOW()
WHERE key = 'ad_playback';

-- Admin / schedule chrome labels (public-safe).
UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'lobby_rotate_section_title',
    COALESCE(NULLIF(trim(value->>'lobby_rotate_section_title'), ''), 'Lobby tile rotation'),
  'lobby_rotate_section_blurb',
    COALESCE(
      NULLIF(trim(value->>'lobby_rotate_section_blurb'), ''),
      'While someone stays on the home lobby, refresh the single lobby ad tile on this interval. One ad at a time. Not a full-screen interrupt.'
    ),
  'lobby_rotate_enabled_label',
    COALESCE(NULLIF(trim(value->>'lobby_rotate_enabled_label'), ''), 'Lobby tile rotation'),
  'lobby_rotate_interval_label',
    COALESCE(NULLIF(trim(value->>'lobby_rotate_interval_label'), ''), 'Lobby rotate interval (seconds)'),
  'freq_caps_section_title',
    COALESCE(NULLIF(trim(value->>'freq_caps_section_title'), ''), 'Viewer frequency caps'),
  'freq_caps_section_blurb',
    COALESCE(
      NULLIF(trim(value->>'freq_caps_section_blurb'), ''),
      'Limit how often the same viewer sees the same campaign or placement across lobby and in-match. Zero disables that cap. Min gap applies between any two shows for that viewer.'
    ),
  'freq_cap_campaign_hour_label',
    COALESCE(NULLIF(trim(value->>'freq_cap_campaign_hour_label'), ''), 'Same campaign per viewer / hour'),
  'freq_cap_campaign_day_label',
    COALESCE(NULLIF(trim(value->>'freq_cap_campaign_day_label'), ''), 'Same campaign per viewer / day'),
  'freq_cap_placement_hour_label',
    COALESCE(NULLIF(trim(value->>'freq_cap_placement_hour_label'), ''), 'Same placement per viewer / hour'),
  'freq_cap_placement_day_label',
    COALESCE(NULLIF(trim(value->>'freq_cap_placement_day_label'), ''), 'Same placement per viewer / day'),
  'freq_cap_min_gap_label',
    COALESCE(NULLIF(trim(value->>'freq_cap_min_gap_label'), ''), 'Min seconds between any ads (viewer)')
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';
