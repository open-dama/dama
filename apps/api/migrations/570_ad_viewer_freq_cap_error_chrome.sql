-- Phase A: player-facing copy when impression is blocked by viewer frequency policy.
-- Additive heal into ad_runtime_chrome (same pattern as other ads err_* keys).

UPDATE platform_settings
SET value = COALESCE(value, '{}'::jsonb) || jsonb_build_object(
  'err_viewer_freq_cap',
  COALESCE(
    NULLIF(trim(value->>'err_viewer_freq_cap'), ''),
    'Ad frequency limit reached for this viewer'
  )
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';
