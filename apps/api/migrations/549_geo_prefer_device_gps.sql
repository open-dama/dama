-- Prefer device GPS for geo (default ON).
-- When ON: HTML5 / device GPS may enrich /geo/locate (jurisdiction + cash).
-- When OFF: IP-only mode for locate (VPN / local invent applies); clients skip GPS.
-- Soft-fill only. Idempotent.

INSERT INTO feature_flags (key, enabled, payload) VALUES
  ('geo_prefer_device_gps', TRUE, '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;

UPDATE platform_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{toggles}',
  COALESCE(value->'toggles', '[]'::jsonb) || CASE
    WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(COALESCE(value->'toggles', '[]'::jsonb)) t
      WHERE t->>'key' = 'geo_prefer_device_gps'
    ) THEN '[]'::jsonb
    ELSE jsonb_build_array(jsonb_build_object(
      'key', 'geo_prefer_device_gps',
      'title', 'Prefer device GPS for geo',
      'description', 'When on, web and mobile may send device GPS to /geo/locate for jurisdiction and cash routing. When off, locate is IP-only (VPN and private-IP invent apply). Default on.',
      'kind', 'boolean',
      'state_field', 'geoPreferDeviceGps'
    ))
  END
),
updated_at = NOW()
WHERE key = 'feature_flag_catalog';

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{toggles}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN elem->>'key' = 'geo_prefer_device_gps'
          THEN elem || jsonb_build_object(
            'state_field', 'geoPreferDeviceGps',
            'title', COALESCE(NULLIF(trim(elem->>'title'), ''), 'Prefer device GPS for geo'),
            'description', COALESCE(
              NULLIF(trim(elem->>'description'), ''),
              'When on, web and mobile may send device GPS to /geo/locate for jurisdiction and cash routing. When off, locate is IP-only (VPN and private-IP invent apply). Default on.'
            )
          )
        ELSE elem
      END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(COALESCE(value->'toggles', '[]'::jsonb)) AS elem
  )
),
updated_at = NOW()
WHERE key = 'feature_flag_catalog';

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{feature_flags}',
  COALESCE(value->'feature_flags', '{}'::jsonb) || jsonb_build_object(
    'geo_ip_only_mode_warn',
    COALESCE(
      NULLIF(trim(value->'feature_flags'->>'geo_ip_only_mode_warn'), ''),
      'IP-only mode. VPN/local IP invent applies.'
    )
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';
