-- Invoice marketplace lines + high-rated audience multiplier (additive).
-- Legacy create-fee + flat impression_unit_cost unchanged. Credit lines stay prepaid wallet.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'invoice_pdf_table_header', 'Campaign | Status | Buy | Rate | Package | Views | Clicks | Est. spend',
  'invoice_pdf_table_rule', '--------------------------------------------------------------------------',
  'invoice_pdf_line_template', '{title} | {status} | {buying} | {rate} | {package} | {impressions} | {clicks} | {est_spend}',
  'invoice_pdf_totals_template', 'Totals: views={impressions} clicks={clicks} CTR={ctr}% est. spend={est_spend}',
  'invoice_pdf_settle_blurb', 'Est. spend uses your campaign rate times views (same units as daily budget). Create fees and optional live wallet settle post separately to your wallet.',
  'invoice_pdf_buying_standard_label', 'Standard'
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';

UPDATE platform_settings
SET value = value
  || jsonb_build_object(
    'audience_high_rating_min', COALESCE(
      NULLIF((NULLIF(trim(value->>'audience_high_rating_min'), ''))::int, NULL),
      1600
    ),
    'audience_high_rating_multiplier', COALESCE(
      NULLIF((NULLIF(trim(value->>'audience_high_rating_multiplier'), ''))::numeric, 0),
      1.15
    )
  ),
  updated_at = NOW()
WHERE key = 'ad_pricing';

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{progression}',
  COALESCE(value->'progression', '{}'::jsonb)
  || jsonb_build_object(
    'audience_high_rating_min_label', 'High-rated audience minimum',
    'audience_high_rating_min_blurb', 'Player rating at or above this value counts as a high-value audience. Views to those players can cost more.',
    'audience_high_rating_multiplier_label', 'High-rated audience multiplier',
    'audience_high_rating_multiplier_blurb', 'Multiplies the effective per-view rate when the viewer meets the high-rated minimum. Set to 1 to turn off.'
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';
