-- Require explicit reserved rate for non-package reservation (public chrome).
UPDATE platform_settings
SET value = value || jsonb_build_object(
  'err_reserved_cpm_required', COALESCE(
    NULLIF(trim(value->>'err_reserved_cpm_required'), ''),
    'Enter a reserved rate at or above the floor price'
  )
),
updated_at = now()
WHERE key = 'ad_runtime_chrome';
