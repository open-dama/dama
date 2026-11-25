-- Repair: ensure ad_pricing marketplace knobs exist even if a later legacy save
-- overwrote the JSON after 552. Idempotent merge; preserves existing fees/unit cost.
-- Also seed a minimal ad_pricing row when missing (local/empty DBs).

INSERT INTO platform_settings (key, value, updated_at)
VALUES (
  'ad_pricing',
  '{
    "impression_unit_cost": 0.01,
    "campaign_create_fee_ethiopia_amount": 25,
    "campaign_create_fee_ethiopia_currency": "ETB",
    "campaign_create_fee_global_amount": 5,
    "campaign_create_fee_global_currency": "USD",
    "campaign_create_fee_amount": 25,
    "campaign_create_fee_currency": "ETB"
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

UPDATE platform_settings
SET value = value
  || jsonb_build_object(
    'marketplace_enabled', COALESCE((value->>'marketplace_enabled')::boolean, true),
    'auction_enabled', COALESCE((value->>'auction_enabled')::boolean, true),
    'reservation_enabled', COALESCE((value->>'reservation_enabled')::boolean, true),
    'default_buying_type', COALESCE(NULLIF(trim(value->>'default_buying_type'), ''), 'auction'),
    'floor_cpm', COALESCE(
      NULLIF((NULLIF(trim(value->>'floor_cpm'), ''))::numeric, 0),
      NULLIF((NULLIF(trim(value->>'impression_unit_cost'), ''))::numeric, 0),
      0.01
    ),
    'placement_lobby_multiplier', COALESCE(NULLIF((NULLIF(trim(value->>'placement_lobby_multiplier'), ''))::numeric, 0), 1),
    'placement_in_match_multiplier', COALESCE(NULLIF((NULLIF(trim(value->>'placement_in_match_multiplier'), ''))::numeric, 0), 1.5),
    'viewport_desktop_multiplier', COALESCE(NULLIF((NULLIF(trim(value->>'viewport_desktop_multiplier'), ''))::numeric, 0), 1),
    'viewport_tablet_multiplier', COALESCE(NULLIF((NULLIF(trim(value->>'viewport_tablet_multiplier'), ''))::numeric, 0), 1),
    'viewport_mobile_multiplier', COALESCE(NULLIF((NULLIF(trim(value->>'viewport_mobile_multiplier'), ''))::numeric, 0), 1.1),
    'peak_hour_multiplier', COALESCE(NULLIF((NULLIF(trim(value->>'peak_hour_multiplier'), ''))::numeric, 0), 1.25),
    'peak_hours_utc_start', COALESCE(NULLIF((NULLIF(trim(value->>'peak_hours_utc_start'), ''))::int, NULL), 17),
    'peak_hours_utc_end', COALESCE(NULLIF((NULLIF(trim(value->>'peak_hours_utc_end'), ''))::int, NULL), 22),
    'dynamic_floor_enabled', COALESCE((value->>'dynamic_floor_enabled')::boolean, true),
    'dynamic_floor_fill_pct', COALESCE(NULLIF((NULLIF(trim(value->>'dynamic_floor_fill_pct'), ''))::numeric, 0), 70),
    'dynamic_floor_boost', COALESCE(NULLIF((NULLIF(trim(value->>'dynamic_floor_boost'), ''))::numeric, 0), 1.2),
    'agency_enabled', COALESCE((value->>'agency_enabled')::boolean, true),
    'agency_spend_percent', COALESCE(NULLIF((NULLIF(trim(value->>'agency_spend_percent'), ''))::numeric, 0), 5),
    'impression_wallet_settle_enabled', COALESCE((value->>'impression_wallet_settle_enabled')::boolean, false),
    'tiers', COALESCE(
      value->'tiers',
      '[
        {"code":"starter","label":"Starter","blurb":"Good for trying ads. Auction buying. Low daily media minimum.","monthly_spend_min":0,"create_fee_multiplier":1,"media_daily_min":0,"unlock_reservation":false,"unlock_packages":false,"list_cpm_multiplier":1},
        {"code":"growth","label":"Growth","blurb":"For growing brands. Unlocks reservation, home and live packages, and higher reach.","monthly_spend_min":100,"create_fee_multiplier":1,"media_daily_min":5,"unlock_reservation":true,"unlock_packages":true,"list_cpm_multiplier":1.1},
        {"code":"enterprise","label":"Enterprise","blurb":"For large advertisers. Tournament packages, reservation, and priority inventory.","monthly_spend_min":1000,"create_fee_multiplier":0,"media_daily_min":50,"unlock_reservation":true,"unlock_packages":true,"list_cpm_multiplier":1.25}
      ]'::jsonb
    )
  ),
  updated_at = NOW()
WHERE key = 'ad_pricing';

INSERT INTO platform_settings (key, value, updated_at)
VALUES (
  'ad_packages',
  '{
    "packages": [
      {
        "code": "home_spotlight",
        "title": "Home spotlight",
        "blurb": "Guaranteed home lobby placement for your flight. Predictable reach at a fixed rate.",
        "buying_type": "reservation",
        "fixed_cpm": 0.05,
        "flight_fee": 0,
        "min_tier": "growth",
        "placement": "lobby",
        "enabled": true,
        "sort_order": 10
      },
      {
        "code": "live_board_boost",
        "title": "Live board boost",
        "blurb": "Priority in-match placement while games are live. Higher attention, higher rate.",
        "buying_type": "reservation",
        "fixed_cpm": 0.08,
        "flight_fee": 0,
        "min_tier": "growth",
        "placement": "in_match",
        "enabled": true,
        "sort_order": 20
      },
      {
        "code": "tournament_season",
        "title": "Tournament season",
        "blurb": "Season package around tournament traffic. Best for big brands that want certainty.",
        "buying_type": "reservation",
        "fixed_cpm": 0.12,
        "flight_fee": 250,
        "min_tier": "enterprise",
        "placement": "lobby",
        "enabled": true,
        "sort_order": 30
      }
    ]
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Admin package/tier field labels (public admin chrome only).
UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{progression}',
  COALESCE(value->'progression', '{}'::jsonb)
  || jsonb_build_object(
    'package_fixed_cpm_label', COALESCE(NULLIF(trim(value->'progression'->>'package_fixed_cpm_label'), ''), 'Package fixed CPM'),
    'package_flight_fee_label', COALESCE(NULLIF(trim(value->'progression'->>'package_flight_fee_label'), ''), 'Package flight fee'),
    'package_min_tier_label', COALESCE(NULLIF(trim(value->'progression'->>'package_min_tier_label'), ''), 'Minimum advertiser level'),
    'package_placement_label', COALESCE(NULLIF(trim(value->'progression'->>'package_placement_label'), ''), 'Placement'),
    'package_enabled_label', COALESCE(NULLIF(trim(value->'progression'->>'package_enabled_label'), ''), 'Package enabled'),
    'tier_code_label', COALESCE(NULLIF(trim(value->'progression'->>'tier_code_label'), ''), 'Level code'),
    'tier_label_label', COALESCE(NULLIF(trim(value->'progression'->>'tier_label_label'), ''), 'Level name'),
    'tier_monthly_spend_min_label', COALESCE(NULLIF(trim(value->'progression'->>'tier_monthly_spend_min_label'), ''), 'Monthly spend minimum'),
    'tier_create_fee_multiplier_label', COALESCE(NULLIF(trim(value->'progression'->>'tier_create_fee_multiplier_label'), ''), 'Create fee multiplier'),
    'tier_media_daily_min_label', COALESCE(NULLIF(trim(value->'progression'->>'tier_media_daily_min_label'), ''), 'Daily media minimum'),
    'tier_unlock_reservation_label', COALESCE(NULLIF(trim(value->'progression'->>'tier_unlock_reservation_label'), ''), 'Unlock reservation'),
    'tier_unlock_packages_label', COALESCE(NULLIF(trim(value->'progression'->>'tier_unlock_packages_label'), ''), 'Unlock packages'),
    'tier_list_cpm_multiplier_label', COALESCE(NULLIF(trim(value->'progression'->>'tier_list_cpm_multiplier_label'), ''), 'List CPM multiplier')
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';
