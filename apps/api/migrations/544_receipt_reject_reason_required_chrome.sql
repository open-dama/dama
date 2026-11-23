-- Console receipt reject: require a player-facing reason (Telegram bot parity).
-- Soft-fill only. Idempotent.

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{payments}',
  COALESCE(value->'payments', '{}'::jsonb) || jsonb_build_object(
    'receipt_reject_reason_required',
    COALESCE(
      NULLIF(trim(value->'payments'->>'receipt_reject_reason_required'), ''),
      'Rejection reason is required.'
    )
  ),
  true
),
  updated_at = NOW()
WHERE key = 'admin_console_chrome';
