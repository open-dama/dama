-- Heal VSIM UX regressions:
-- 1) review_note_joiner must keep trailing space (". " not ".") - trim() in 545 ELSE path
--    could collapse ". " → "." on re-apply.
-- 2) Detail nav buttons: colder "Back to hub"/"Close" → VSIM-style list/close labels.
-- Soft-fill / heal only. Idempotent.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'review_note_joiner',
  CASE
    WHEN NULLIF(value->>'review_note_joiner', '') IS NULL
      OR trim(value->>'review_note_joiner') IN ('|', '.', '·')
      OR value->>'review_note_joiner' IN ('|', ' | ', '| ', '.')
    THEN '. '
    ELSE value->>'review_note_joiner'
  END,
  'btn_back_hub',
  CASE
    WHEN NULLIF(trim(value->>'btn_back_hub'), '') IS NULL
      OR lower(trim(value->>'btn_back_hub')) IN (
        'back to hub',
        'back',
        'hub'
      )
    THEN '⬅️ Back to List'
    ELSE trim(value->>'btn_back_hub')
  END,
  'btn_close',
  CASE
    WHEN NULLIF(trim(value->>'btn_close'), '') IS NULL
      OR lower(trim(value->>'btn_close')) IN ('close', 'dismiss')
    THEN '🗑️ Close'
    ELSE trim(value->>'btn_close')
  END
),
  updated_at = NOW()
WHERE key = 'telegram_ops_bot';
