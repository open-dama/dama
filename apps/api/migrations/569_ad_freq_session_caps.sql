-- Phase A hygiene: per-session viewer frequency caps + session_key on impression events.
-- Additive. Lobby rotate remains soft tile refresh only (no interrupt overlay).

ALTER TABLE ad_impression_events
  ADD COLUMN IF NOT EXISTS session_key TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_ad_impression_events_session_campaign_created
  ON ad_impression_events (session_key, campaign_id, created_at DESC)
  WHERE session_key <> '';

CREATE INDEX IF NOT EXISTS idx_ad_impression_events_session_placement_created
  ON ad_impression_events (session_key, placement, created_at DESC)
  WHERE session_key <> '';

UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'freq_cap_campaign_per_session',
    COALESCE(
      (NULLIF(trim(value->>'freq_cap_campaign_per_session'), ''))::int,
      2
    ),
  'freq_cap_placement_per_session',
    COALESCE(
      (NULLIF(trim(value->>'freq_cap_placement_per_session'), ''))::int,
      4
    )
),
updated_at = NOW()
WHERE key = 'ad_playback';

UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'freq_cap_campaign_session_label',
    COALESCE(NULLIF(trim(value->>'freq_cap_campaign_session_label'), ''), 'Same campaign per viewer / session'),
  'freq_cap_placement_session_label',
    COALESCE(NULLIF(trim(value->>'freq_cap_placement_session_label'), ''), 'Same placement per viewer / session')
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';
