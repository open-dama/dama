-- Invoice agency column (public yes/no). Additive; est. spend already includes agency %.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'invoice_pdf_table_header', 'Campaign | Status | Buy | Rate | Package | Agency | Views | Clicks | Est. spend',
  'invoice_pdf_table_rule', '--------------------------------------------------------------------------------',
  'invoice_pdf_line_template', '{title} | {status} | {buying} | {rate} | {package} | {agency} | {impressions} | {clicks} | {est_spend}',
  'invoice_pdf_agency_yes', COALESCE(NULLIF(trim(value->>'invoice_pdf_agency_yes'), ''), 'Yes'),
  'invoice_pdf_agency_no', COALESCE(NULLIF(trim(value->>'invoice_pdf_agency_no'), ''), '-')
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';
