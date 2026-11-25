-- Heal missing ad_pricing row (local DBs that lost the key after earlier migrates).
-- Idempotent: insert seed if absent, then merge marketplace knobs. Legacy fees preserved when present.

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
    "campaign_create_fee_currency": "ETB",
    "marketplace_enabled": true,
    "auction_enabled": true,
    "reservation_enabled": true,
    "default_buying_type": "auction",
    "floor_cpm": 0.01,
    "floor_cpm_ethiopia": 0.01,
    "floor_cpm_global": 0.01,
    "placement_lobby_multiplier": 1,
    "placement_in_match_multiplier": 1.5,
    "viewport_desktop_multiplier": 1,
    "viewport_tablet_multiplier": 1,
    "viewport_mobile_multiplier": 1.1,
    "peak_hour_multiplier": 1.25,
    "peak_hours_utc_start": 17,
    "peak_hours_utc_end": 22,
    "dynamic_floor_enabled": true,
    "dynamic_floor_fill_pct": 70,
    "dynamic_floor_boost": 1.2,
    "agency_enabled": true,
    "agency_spend_percent": 5,
    "impression_wallet_settle_enabled": false,
    "audience_high_rating_min": 1600,
    "audience_high_rating_multiplier": 1.15,
    "tiers": [
      {"code":"starter","label":"Starter","blurb":"Good for trying ads. Auction buying. Low daily media minimum.","monthly_spend_min":0,"create_fee_multiplier":1,"media_daily_min":0,"unlock_reservation":false,"unlock_packages":false,"list_cpm_multiplier":1},
      {"code":"growth","label":"Growth","blurb":"For growing brands. Unlocks reservation, home and live packages, and higher reach.","monthly_spend_min":100,"create_fee_multiplier":1,"media_daily_min":5,"unlock_reservation":true,"unlock_packages":true,"list_cpm_multiplier":1.1},
      {"code":"enterprise","label":"Enterprise","blurb":"For large advertisers. Tournament packages, reservation, and priority inventory.","monthly_spend_min":1000,"create_fee_multiplier":0,"media_daily_min":50,"unlock_reservation":true,"unlock_packages":true,"list_cpm_multiplier":1.25}
    ]
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
    'floor_cpm_ethiopia', COALESCE(
      NULLIF((NULLIF(trim(value->>'floor_cpm_ethiopia'), ''))::numeric, 0),
      NULLIF((NULLIF(trim(value->>'floor_cpm'), ''))::numeric, 0),
      0.01
    ),
    'floor_cpm_global', COALESCE(
      NULLIF((NULLIF(trim(value->>'floor_cpm_global'), ''))::numeric, 0),
      NULLIF((NULLIF(trim(value->>'floor_cpm'), ''))::numeric, 0),
      0.01
    ),
    'audience_high_rating_min', COALESCE(
      NULLIF((NULLIF(trim(value->>'audience_high_rating_min'), ''))::int, NULL),
      1600
    ),
    'audience_high_rating_multiplier', COALESCE(
      NULLIF((NULLIF(trim(value->>'audience_high_rating_multiplier'), ''))::numeric, 0),
      1.15
    ),
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
