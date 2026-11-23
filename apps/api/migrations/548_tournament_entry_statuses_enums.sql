-- Soft-fill official cup entry status enums for roster status filters (admin Players).
-- Idempotent. Matches tournament_entries.status default 'registered' (001_init).

UPDATE platform_settings
SET value = value
  || jsonb_build_object(
    'tournament_entry_statuses',
    CASE
      WHEN jsonb_typeof(value->'tournament_entry_statuses') = 'array'
        AND jsonb_array_length(value->'tournament_entry_statuses') > 0
      THEN value->'tournament_entry_statuses'
      ELSE '["registered"]'::jsonb
    END,
    'tournament_entry_registered',
    COALESCE(NULLIF(trim(value->>'tournament_entry_registered'), ''), 'registered'),
    'tournament_entry_status_labels',
    COALESCE(
      NULLIF(value->'tournament_entry_status_labels', 'null'::jsonb),
      '{}'::jsonb
    ) || jsonb_build_object(
      'registered',
      COALESCE(
        NULLIF(trim(value->'tournament_entry_status_labels'->>'registered'), ''),
        'Registered'
      )
    )
  ),
  updated_at = NOW()
WHERE key = 'client_enums';
