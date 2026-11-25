-- Match clock presets: admin CRUD via platform_settings.match_clock.presets.
-- Soft fields: enabled + sort_order. Seed defaults once if presets empty.
-- Soft-disable (enabled=false) retires a TC; never hard-delete from this migration.
-- Bootstrap seed remains disaster recovery; admin owns the list afterward.

DO $$
DECLARE
  raw jsonb;
  presets jsonb;
  new_presets jsonb := '[]'::jsonb;
  elem jsonb;
  i int := 0;
  sec int;
  lab text;
  en boolean;
  sort_ord int;
BEGIN
  SELECT value INTO raw FROM platform_settings WHERE key = 'match_clock';
  IF raw IS NULL THEN
    RETURN;
  END IF;

  presets := COALESCE(raw->'presets', '[]'::jsonb);
  IF jsonb_typeof(presets) <> 'array' OR jsonb_array_length(presets) = 0 THEN
    new_presets := '[
      {"seconds": 60, "label": "1 min", "enabled": true, "sort_order": 0},
      {"seconds": 180, "label": "3 min", "enabled": true, "sort_order": 1},
      {"seconds": 300, "label": "5 min", "enabled": true, "sort_order": 2},
      {"seconds": 600, "label": "10 min", "enabled": true, "sort_order": 3},
      {"seconds": 1800, "label": "30 min", "enabled": true, "sort_order": 4}
    ]'::jsonb;
  ELSE
    FOR elem IN SELECT value FROM jsonb_array_elements(presets) AS t(value)
    LOOP
      sec := COALESCE(NULLIF(trim(elem->>'seconds'), '')::int, 0);
      lab := COALESCE(NULLIF(trim(elem->>'label'), ''), '');
      IF lab = '' AND sec > 0 THEN
        lab := sec::text || 's';
      END IF;
      IF elem ? 'enabled' THEN
        en := COALESCE((elem->>'enabled')::boolean, true);
      ELSE
        -- Legacy seeded rows without enabled → treat as playable.
        en := true;
      END IF;
      IF elem ? 'sort_order' THEN
        sort_ord := COALESCE(NULLIF(trim(elem->>'sort_order'), '')::int, i);
      ELSE
        sort_ord := i;
      END IF;
      IF sec > 0 AND lab <> '' THEN
        new_presets := new_presets || jsonb_build_array(
          jsonb_build_object(
            'seconds', sec,
            'label', lab,
            'enabled', en,
            'sort_order', sort_ord
          )
        );
        i := i + 1;
      END IF;
    END LOOP;
    IF jsonb_array_length(new_presets) = 0 THEN
      new_presets := '[
        {"seconds": 60, "label": "1 min", "enabled": true, "sort_order": 0},
        {"seconds": 180, "label": "3 min", "enabled": true, "sort_order": 1},
        {"seconds": 300, "label": "5 min", "enabled": true, "sort_order": 2},
        {"seconds": 600, "label": "10 min", "enabled": true, "sort_order": 3},
        {"seconds": 1800, "label": "30 min", "enabled": true, "sort_order": 4}
      ]'::jsonb;
    END IF;
  END IF;

  UPDATE platform_settings
  SET
    value = jsonb_set(COALESCE(value, '{}'::jsonb), '{presets}', new_presets, true),
    updated_at = NOW()
  WHERE key = 'match_clock';
END $$;

-- Ensure default initial_seconds is an enabled preset (heal if needed).
UPDATE platform_settings
SET
  value = jsonb_set(
    value,
    '{initial_seconds}',
    to_jsonb((
      SELECT COALESCE(
        (
          SELECT (p->>'seconds')::int
          FROM jsonb_array_elements(value->'presets') p
          WHERE COALESCE((p->>'enabled')::boolean, true) = true
            AND (p->>'seconds')::int = COALESCE((value->>'initial_seconds')::int, 0)
          LIMIT 1
        ),
        (
          SELECT (p->>'seconds')::int
          FROM jsonb_array_elements(value->'presets') p
          WHERE COALESCE((p->>'enabled')::boolean, true) = true
          ORDER BY COALESCE((p->>'sort_order')::int, 0), (p->>'seconds')::int
          LIMIT 1
        ),
        COALESCE((value->>'initial_seconds')::int, 600)
      )
    )),
    true
  ),
  updated_at = NOW()
WHERE key = 'match_clock'
  AND value ? 'presets'
  AND jsonb_typeof(value->'presets') = 'array'
  AND jsonb_array_length(value->'presets') > 0;

-- Admin Progression chrome for preset CRUD (soft-fill; fail-closed keys wired in API).
UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{progression}',
  COALESCE(value->'progression', '{}'::jsonb) || jsonb_build_object(
    'match_clock_presets_blurb',
    COALESCE(
      NULLIF(trim(value->'progression'->>'match_clock_presets_blurb'), ''),
      'Shared by Play AI, Challenge, and matchmaking. Disable a preset to hide it from new games; in-flight matches keep their clock.'
    ),
    'initial_seconds_blurb',
    COALESCE(
      NULLIF(trim(value->'progression'->>'initial_seconds_blurb'), ''),
      'Default for Play AI and Challenge when the player has not picked another preset. Must be an enabled time control preset.'
    ),
    'tc_preset_col_label',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_col_label'), ''), 'Label'),
    'tc_preset_col_seconds',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_col_seconds'), ''), 'Seconds'),
    'tc_preset_col_enabled',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_col_enabled'), ''), 'Enabled'),
    'tc_preset_col_sort',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_col_sort'), ''), 'Order'),
    'tc_preset_actions_label',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_actions_label'), ''), 'Actions'),
    'tc_preset_add_action',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_add_action'), ''), 'Add preset'),
    'tc_preset_view_action',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_view_action'), ''), 'View'),
    'tc_preset_edit_action',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_edit_action'), ''), 'Edit'),
    'tc_preset_disable_action',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_disable_action'), ''), 'Disable'),
    'tc_preset_enable_action',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_enable_action'), ''), 'Enable'),
    'tc_preset_empty',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_empty'), ''), 'No time control presets'),
    'tc_preset_dialog_close_label',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_dialog_close_label'), ''), 'Close'),
    'tc_preset_cancel_action',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_cancel_action'), ''), 'Cancel'),
    'tc_preset_save_action',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_save_action'), ''), 'Save preset'),
    'tc_preset_save_pending',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_save_pending'), ''), 'Saving…'),
    'tc_preset_create_modal_title',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_create_modal_title'), ''), 'Add time control'),
    'tc_preset_edit_modal_title',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_edit_modal_title'), ''), 'Edit time control'),
    'tc_preset_detail_modal_title',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_detail_modal_title'), ''), 'Time control'),
    'tc_preset_disable_confirm',
    COALESCE(
      NULLIF(trim(value->'progression'->>'tc_preset_disable_confirm'), ''),
      'Disable this preset? New games will not offer it. In-flight matches keep their clock.'
    ),
    'tc_preset_label_field',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_label_field'), ''), 'Label'),
    'tc_preset_seconds_field',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_seconds_field'), ''), 'Seconds'),
    'tc_preset_enabled_field',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_enabled_field'), ''), 'Enabled for new games'),
    'tc_preset_sort_field',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_sort_field'), ''), 'Sort order'),
    'tc_preset_search_label',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_search_label'), ''), 'Search presets'),
    'tc_preset_search_placeholder',
    COALESCE(NULLIF(trim(value->'progression'->>'tc_preset_search_placeholder'), ''), 'Label or seconds'),
    'err_tc_presets_empty',
    COALESCE(
      NULLIF(trim(value->'progression'->>'err_tc_presets_empty'), ''),
      'At least one enabled time control preset is required'
    ),
    'err_tc_preset_duplicate',
    COALESCE(
      NULLIF(trim(value->'progression'->>'err_tc_preset_duplicate'), ''),
      'Each preset must use a unique seconds value'
    ),
    'err_tc_preset_values',
    COALESCE(
      NULLIF(trim(value->'progression'->>'err_tc_preset_values'), ''),
      'Each preset needs seconds > 0 and a label'
    ),
    'err_tc_preset_disable_default',
    COALESCE(
      NULLIF(trim(value->'progression'->>'err_tc_preset_disable_default'), ''),
      'Change the default time control before disabling this preset'
    ),
    'err_tc_preset_disable_last',
    COALESCE(
      NULLIF(trim(value->'progression'->>'err_tc_preset_disable_last'), ''),
      'Cannot disable the last enabled preset'
    )
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';
