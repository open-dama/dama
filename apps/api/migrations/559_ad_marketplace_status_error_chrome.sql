-- Publisher status / reopen error copy for error_key mapping (additive, public only).
-- Does not change create-fee, pricing math, or legacy buying paths.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'err_invalid_status', COALESCE(
    NULLIF(trim(value->>'err_invalid_status'), ''),
    'That status is not available for this campaign.'
  ),
  'err_campaign_cannot_reopen', COALESCE(
    NULLIF(trim(value->>'err_campaign_cannot_reopen'), ''),
    'This campaign cannot be reopened. Create a new campaign if you need to run ads again.'
  ),
  'err_cannot_reopen', COALESCE(
    NULLIF(trim(value->>'err_cannot_reopen'), ''),
    'This campaign cannot be reopened. Create a new campaign if you need to run ads again.'
  ),
  'err_campaign_auto_closed', COALESCE(
    NULLIF(trim(value->>'err_campaign_auto_closed'), ''),
    'This campaign was closed automatically and can no longer be changed.'
  )
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';
