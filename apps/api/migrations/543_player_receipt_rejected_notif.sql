-- Player in-app notification when a manual payment proof is rejected,
-- including the admin/bot rejection reason in the body (option B).
-- Soft-fill only. Idempotent.

INSERT INTO notification_kinds (code, audience, title_template, body_template, href_path, href_query_key)
VALUES
  (
    'player.receipt_rejected',
    'player',
    'Payment proof rejected',
    'Your payment proof was rejected. Reason: %s.',
    '/receipts',
    'id'
  )
ON CONFLICT (code) DO UPDATE SET
  audience = EXCLUDED.audience,
  title_template = COALESCE(NULLIF(trim(notification_kinds.title_template), ''), EXCLUDED.title_template),
  body_template = COALESCE(NULLIF(trim(notification_kinds.body_template), ''), EXCLUDED.body_template),
  href_path = EXCLUDED.href_path,
  href_query_key = EXCLUDED.href_query_key;

-- Console receipt detail: label for the player-facing rejection reason note.
UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{payments}',
  COALESCE(value->'payments', '{}'::jsonb) || jsonb_build_object(
    'receipt_review_note_label',
    COALESCE(
      NULLIF(trim(value->'payments'->>'receipt_review_note_label'), ''),
      'Rejection reason'
    )
  ),
  true
),
  updated_at = NOW()
WHERE key = 'admin_console_chrome';
