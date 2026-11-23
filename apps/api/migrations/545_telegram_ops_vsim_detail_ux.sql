-- VSIM-parity Telegram ops receipt/payout detail UX:
-- labeled fields, friendly receipt link, human admin notes, status chips.
-- Force-heal known legacy emoji-blob / pipe-note seeds. Idempotent.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  -- Human-readable review_note fragments (NEW reviews). Expand {telegram_id}/{reason} in Go.
  'review_note_approved_prefix',
  CASE
    WHEN NULLIF(trim(value->>'review_note_approved_prefix'), '') IS NULL
      OR lower(trim(value->>'review_note_approved_prefix')) IN (
        'approved via telegram ops bot',
        'approved via telegram ops bot '
      )
    THEN 'Approved via Telegram Bot by {telegram_id}'
    ELSE trim(value->>'review_note_approved_prefix')
  END,
  'review_note_rejected_prefix',
  CASE
    WHEN NULLIF(trim(value->>'review_note_rejected_prefix'), '') IS NULL
      OR lower(trim(value->>'review_note_rejected_prefix')) IN (
        'rejected via telegram ops bot',
        'rejected via telegram ops bot '
      )
    THEN 'Rejected via Telegram Bot by {telegram_id}'
    ELSE trim(value->>'review_note_rejected_prefix')
  END,
  'review_note_paid_prefix',
  CASE
    WHEN NULLIF(trim(value->>'review_note_paid_prefix'), '') IS NULL
      OR lower(trim(value->>'review_note_paid_prefix')) IN (
        'paid via telegram ops bot',
        'paid via telegram ops bot '
      )
    THEN 'Marked paid via Telegram Bot by {telegram_id}'
    ELSE trim(value->>'review_note_paid_prefix')
  END,
  'review_note_telegram_id_template',
  CASE
    WHEN NULLIF(trim(value->>'review_note_telegram_id_template'), '') IS NULL
      OR trim(value->>'review_note_telegram_id_template') IN (
        'telegram_admin_id={telegram_id}',
        'telegram_admin_id={telegram_id} '
      )
    THEN 'by {telegram_id}'
    ELSE trim(value->>'review_note_telegram_id_template')
  END,
  'review_note_reason_template',
  CASE
    WHEN NULLIF(trim(value->>'review_note_reason_template'), '') IS NULL
      OR trim(value->>'review_note_reason_template') IN (
        'reason={reason}',
        'reason={reason} '
      )
    THEN 'Reason: {reason}'
    ELSE trim(value->>'review_note_reason_template')
  END,
  -- Keep trailing space in ". " - never trim the joiner value itself.
  'review_note_joiner',
  CASE
    WHEN NULLIF(value->>'review_note_joiner', '') IS NULL
      OR trim(value->>'review_note_joiner') IN ('|', '.', '·')
      OR value->>'review_note_joiner' IN ('|', ' | ', '| ', '.')
    THEN '. '
    ELSE value->>'review_note_joiner'
  END,

  'btn_view_receipt',
  COALESCE(NULLIF(trim(value->>'btn_view_receipt'), ''), '🖼️ View Receipt'),
  'receipt_link_html_template',
  COALESCE(
    NULLIF(trim(value->>'receipt_link_html_template'), ''),
    '<a href="{url}">👁️ View Receipt</a>'
  ),
  'detail_choose_action',
  COALESCE(NULLIF(trim(value->>'detail_choose_action'), ''), 'Choose an action:'),
  'status_chip_pending',
  COALESCE(NULLIF(trim(value->>'status_chip_pending'), ''), '⏳ Pending'),
  'status_chip_approved',
  COALESCE(NULLIF(trim(value->>'status_chip_approved'), ''), '✅ Approved'),
  'status_chip_rejected',
  COALESCE(NULLIF(trim(value->>'status_chip_rejected'), ''), '❌ Rejected'),
  'status_chip_paid',
  COALESCE(NULLIF(trim(value->>'status_chip_paid'), ''), '✅ Paid'),
  'status_icon_pending',
  COALESCE(NULLIF(trim(value->>'status_icon_pending'), ''), '⏳'),
  'status_icon_approved',
  COALESCE(NULLIF(trim(value->>'status_icon_approved'), ''), '✅'),
  'status_icon_rejected',
  COALESCE(NULLIF(trim(value->>'status_icon_rejected'), ''), '❌'),
  'status_icon_paid',
  COALESCE(NULLIF(trim(value->>'status_icon_paid'), ''), '✅'),

  'receipt_detail_html_template',
  CASE
    WHEN NULLIF(trim(value->>'receipt_detail_html_template'), '') IS NULL
      OR position('📑 <b>{title}</b>' in trim(value->>'receipt_detail_html_template')) = 1
      OR position('📑 <b>{title}</b>' in replace(trim(value->>'receipt_detail_html_template'), E'\r', '')) = 1
    THEN
'{status_icon} <b>{title} #{id_short}</b>
📄 <b>Receipt request detail</b>

User: {name}
Email: <code>{email}</code>
Phone: <code>{phone}</code>
Amount: <b>{amount} {currency}</b>
Requested At: {created}
Receipt: {receipt_link}
Status: {status_label}

{choose_action}
'
    ELSE trim(value->>'receipt_detail_html_template')
  END,

  'payout_detail_html_template',
  CASE
    WHEN NULLIF(trim(value->>'payout_detail_html_template'), '') IS NULL
      OR position('📑 <b>{title}</b>' in trim(value->>'payout_detail_html_template')) = 1
      OR position('📑 <b>{title}</b>' in replace(trim(value->>'payout_detail_html_template'), E'\r', '')) = 1
    THEN
'{status_icon} <b>{title} #{id_short}</b>
📄 <b>Payout request detail</b>

User: {name}
Email: <code>{email}</code>
Phone: <code>{phone}</code>
Amount: <b>{amount} {currency}</b>
Method: {method}
Requested At: {created}
Status: {status_label}

{choose_action}
'
    ELSE trim(value->>'payout_detail_html_template')
  END,

  'receipt_detail_notes_html_template',
  CASE
    WHEN NULLIF(trim(value->>'receipt_detail_notes_html_template'), '') IS NULL
      OR trim(value->>'receipt_detail_notes_html_template') LIKE '📝 <b>Notes</b>%'
    THEN
'📝 <b>Admin Notes:</b>
{note}
'
    ELSE trim(value->>'receipt_detail_notes_html_template')
  END,

  'payout_detail_notes_html_template',
  CASE
    WHEN NULLIF(trim(value->>'payout_detail_notes_html_template'), '') IS NULL
      OR trim(value->>'payout_detail_notes_html_template') LIKE '📝 <b>Notes</b>%'
    THEN
'📝 <b>Admin Notes:</b>
{note}
'
    ELSE trim(value->>'payout_detail_notes_html_template')
  END
),
  updated_at = NOW()
WHERE key = 'telegram_ops_bot';
