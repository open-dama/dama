-- Repair local corruption: duplicate platform_settings keys despite PK (keep richest newest row).
-- Safe on healthy DBs (no-op when each key appears once). Does not change marketplace pricing math.

WITH ranked AS (
  SELECT ctid AS rid,
    ROW_NUMBER() OVER (
      PARTITION BY key
      ORDER BY
        CASE
          WHEN key = 'ad_pricing' AND coalesce(value->>'marketplace_enabled', '') = 'true' THEN 0
          WHEN key = 'ad_pricing' THEN 1
          ELSE 0
        END,
        CASE WHEN value ? 'tiers' THEN 0 ELSE 1 END,
        CASE WHEN value ? 'marketplace_fields_locked_blurb' THEN 0 ELSE 1 END,
        updated_at DESC NULLS LAST,
        ctid DESC
    ) AS rn
  FROM platform_settings
)
DELETE FROM platform_settings p
WHERE p.ctid IN (SELECT rid FROM ranked WHERE rn > 1);

REINDEX INDEX platform_settings_pkey;
