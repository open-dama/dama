-- Add 5 min (300s) time-control preset once if missing.
-- Does not rewrite admin-owned labels/enabled flags for other presets.
-- Places 5 min after 3 min in sort_order; bumps later rows by +1 only when inserting.

DO $$
DECLARE
  raw jsonb;
  presets jsonb;
  has_5 boolean := false;
  after_3 int := 1;
  rebuilt jsonb := '[]'::jsonb;
  elem jsonb;
  sec int;
  sort_ord int;
  inserted boolean := false;
BEGIN
  SELECT value INTO raw FROM platform_settings WHERE key = 'match_clock';
  IF raw IS NULL THEN
    RETURN;
  END IF;

  presets := COALESCE(raw->'presets', '[]'::jsonb);
  IF jsonb_typeof(presets) <> 'array' THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(presets) p
    WHERE COALESCE(NULLIF(trim(p->>'seconds'), '')::int, 0) = 300
  ) INTO has_5;

  IF has_5 THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(COALESCE(NULLIF(trim(p->>'sort_order'), '')::int, 0)), 1)
  INTO after_3
  FROM jsonb_array_elements(presets) p
  WHERE COALESCE(NULLIF(trim(p->>'seconds'), '')::int, 0) = 180;

  FOR elem IN SELECT value FROM jsonb_array_elements(presets) AS t(value)
  LOOP
    sec := COALESCE(NULLIF(trim(elem->>'seconds'), '')::int, 0);
    sort_ord := COALESCE(NULLIF(trim(elem->>'sort_order'), '')::int, 0);

    -- Insert 5 min immediately after the 3 min row (or at front of "later" block).
    IF (NOT inserted) AND sort_ord > after_3 THEN
      rebuilt := rebuilt || jsonb_build_array(
        jsonb_build_object(
          'seconds', 300,
          'label', '5 min',
          'enabled', true,
          'sort_order', after_3 + 1
        )
      );
      inserted := true;
    END IF;

    IF sec > 0 THEN
      IF sort_ord > after_3 THEN
        sort_ord := sort_ord + 1;
      END IF;
      rebuilt := rebuilt || jsonb_build_array(
        jsonb_set(
          jsonb_set(elem, '{sort_order}', to_jsonb(sort_ord), true),
          '{seconds}', to_jsonb(sec), true
        )
      );
    END IF;
  END LOOP;

  IF NOT inserted THEN
    rebuilt := rebuilt || jsonb_build_array(
      jsonb_build_object(
        'seconds', 300,
        'label', '5 min',
        'enabled', true,
        'sort_order', after_3 + 1
      )
    );
  END IF;

  UPDATE platform_settings
  SET
    value = jsonb_set(COALESCE(value, '{}'::jsonb), '{presets}', rebuilt, true),
    updated_at = NOW()
  WHERE key = 'match_clock';
END $$;
