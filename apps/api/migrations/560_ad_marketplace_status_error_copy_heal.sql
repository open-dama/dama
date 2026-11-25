-- Heal status/reopen publisher copy to clear public language (additive).
-- Overwrites short legacy API error strings from older seeds.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'err_invalid_status', 'That status is not available for this campaign.',
  'err_campaign_cannot_reopen', 'This campaign cannot be reopened. Create a new campaign if you need to run ads again.',
  'err_cannot_reopen', 'This campaign cannot be reopened. Create a new campaign if you need to run ads again.',
  'err_campaign_auto_closed', 'This campaign was closed automatically and can no longer be changed.'
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';
