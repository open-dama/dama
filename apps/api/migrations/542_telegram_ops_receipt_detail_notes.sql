-- VSIM top-up detail parity: optional review_note lines on Dama receipt/payout detail.
-- Fail-closed when empty (bot skips). Not required for Reload until seeded.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'receipt_detail_notes_html_template',
  COALESCE(
    NULLIF(trim(value->>'receipt_detail_notes_html_template'), ''),
    '📝 <b>Notes</b>
{note}
'
  ),
  'payout_detail_notes_html_template',
  COALESCE(
    NULLIF(trim(value->>'payout_detail_notes_html_template'), ''),
    '📝 <b>Notes</b>
{note}
'
  )
),
    updated_at = NOW()
WHERE key = 'telegram_ops_bot';
