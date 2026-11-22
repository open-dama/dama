-- Telegram ops bridge: default Enabled when fully wired (URL + key + reviewer + timeout).
-- Does not invent secrets; only flips enabled=true when Ready inputs already exist.
UPDATE platform_settings
SET value = value || jsonb_build_object('enabled', true),
    updated_at = NOW()
WHERE key = 'telegram_ops_bot'
  AND COALESCE((value->>'enabled')::boolean, false) = false
  AND NULLIF(trim(value->>'bot_service_url'), '') IS NOT NULL
  AND length(COALESCE(NULLIF(trim(value->>'bot_api_key'), ''), '')) > 0
  AND NULLIF(trim(value->>'reviewer_user_id'), '') IS NOT NULL
  AND COALESCE((value->>'notify_timeout_ms')::int, 0) > 0;
