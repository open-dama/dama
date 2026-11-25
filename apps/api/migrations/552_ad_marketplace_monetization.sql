-- Ad marketplace monetization (additive). Keeps flat create-fee + impression_unit_cost.
-- Auction / reservation buying, inventory multipliers, spend tiers, dynamic floors,
-- packages, agency percent. Existing campaigns stay buying_type=legacy.

-- Campaign marketplace columns (nullable / defaults; legacy path unchanged).
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS buying_type TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS bid_cpm NUMERIC,
  ADD COLUMN IF NOT EXISTS reserved_cpm NUMERIC,
  ADD COLUMN IF NOT EXISTS package_code TEXT,
  ADD COLUMN IF NOT EXISTS agency_managed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS advertiser_tier_code TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ad_campaigns_buying_type_chk'
  ) THEN
    ALTER TABLE ad_campaigns
      ADD CONSTRAINT ad_campaigns_buying_type_chk
      CHECK (buying_type IN ('legacy', 'auction', 'reservation'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ad_campaigns_buying_type_idx ON ad_campaigns (buying_type);
CREATE INDEX IF NOT EXISTS ad_campaigns_package_code_idx ON ad_campaigns (package_code)
  WHERE package_code IS NOT NULL AND length(trim(package_code)) > 0;

-- Extend ad_pricing with marketplace knobs (preserve existing required fees).
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
        {"code":"enterprise","label":"Enterprise","blurb":"For large advertisers. Packages, reservation, and priority inventory.","monthly_spend_min":1000,"create_fee_multiplier":0,"media_daily_min":50,"unlock_reservation":true,"unlock_packages":true,"list_cpm_multiplier":1.25}
      ]'::jsonb
    )
  ),
  updated_at = NOW()
WHERE key = 'ad_pricing';

-- Public package catalog (admin editable via console).
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

-- Publisher chrome: clear plain-language marketplace copy (public only).
UPDATE platform_settings
SET value = value
  || jsonb_build_object(
    'marketplace_section_title', COALESCE(NULLIF(trim(value->>'marketplace_section_title'), ''), 'How ad buying works'),
    'marketplace_section_blurb', COALESCE(NULLIF(trim(value->>'marketplace_section_blurb'), ''), 'You buy attention. Better slots and busy times cost more. Big brands pay more when they compete for the same spots, not because of their company size.'),
    'buying_type_label', COALESCE(NULLIF(trim(value->>'buying_type_label'), ''), 'Buying type'),
    'buying_type_auction_label', COALESCE(NULLIF(trim(value->>'buying_type_auction_label'), ''), 'Auction'),
    'buying_type_auction_blurb', COALESCE(NULLIF(trim(value->>'buying_type_auction_blurb'), ''), 'Flexible. You set a max price per 1,000 views. When others bid higher for the same spot, they may show first.'),
    'buying_type_reservation_label', COALESCE(NULLIF(trim(value->>'buying_type_reservation_label'), ''), 'Reservation'),
    'buying_type_reservation_blurb', COALESCE(NULLIF(trim(value->>'buying_type_reservation_blurb'), ''), 'Predictable. You lock a fixed rate for a premium slot. Good when you need certainty.'),
    'bid_cpm_label', COALESCE(NULLIF(trim(value->>'bid_cpm_label'), ''), 'Max bid (per 1,000 views)'),
    'bid_cpm_blurb', COALESCE(NULLIF(trim(value->>'bid_cpm_blurb'), ''), 'Highest amount you are willing to pay for 1,000 views. Must meet the floor price.'),
    'reserved_cpm_label', COALESCE(NULLIF(trim(value->>'reserved_cpm_label'), ''), 'Reserved rate (per 1,000 views)'),
    'reserved_cpm_blurb', COALESCE(NULLIF(trim(value->>'reserved_cpm_blurb'), ''), 'Fixed rate for this reservation. Shown before you confirm.'),
    'floor_cpm_label', COALESCE(NULLIF(trim(value->>'floor_cpm_label'), ''), 'Floor price'),
    'floor_cpm_blurb', COALESCE(NULLIF(trim(value->>'floor_cpm_blurb'), ''), 'Minimum price per 1,000 views right now. Peak hours and busy inventory can raise this.'),
    'tier_label', COALESCE(NULLIF(trim(value->>'tier_label'), ''), 'Your advertiser level'),
    'tier_blurb', COALESCE(NULLIF(trim(value->>'tier_blurb'), ''), 'Level is based on your recent ad spend on Dama. Higher levels unlock reservation and packages.'),
    'packages_section_title', COALESCE(NULLIF(trim(value->>'packages_section_title'), ''), 'Packages'),
    'packages_section_blurb', COALESCE(NULLIF(trim(value->>'packages_section_blurb'), ''), 'Ready-made premium buys. Pick one if you want a clear plan instead of building from scratch.'),
    'package_label', COALESCE(NULLIF(trim(value->>'package_label'), ''), 'Package'),
    'package_none_label', COALESCE(NULLIF(trim(value->>'package_none_label'), ''), 'No package'),
    'agency_managed_label', COALESCE(NULLIF(trim(value->>'agency_managed_label'), ''), 'Managed by an agency'),
    'agency_managed_blurb', COALESCE(NULLIF(trim(value->>'agency_managed_blurb'), ''), 'Turn on if an agency runs this campaign. A small percent of media may apply when enabled by the platform.'),
    'err_buying_type_required', COALESCE(NULLIF(trim(value->>'err_buying_type_required'), ''), 'Choose a buying type'),
    'err_buying_type_locked', COALESCE(NULLIF(trim(value->>'err_buying_type_locked'), ''), 'This buying type is not available for your level yet'),
    'err_bid_cpm_required', COALESCE(NULLIF(trim(value->>'err_bid_cpm_required'), ''), 'Enter a max bid at or above the floor price'),
    'err_reserved_cpm_required', COALESCE(NULLIF(trim(value->>'err_reserved_cpm_required'), ''), 'Enter a reserved rate at or above the floor price'),
    'err_bid_below_floor', COALESCE(NULLIF(trim(value->>'err_bid_below_floor'), ''), 'Your max bid is below the floor price'),
    'err_reservation_locked', COALESCE(NULLIF(trim(value->>'err_reservation_locked'), ''), 'Reservation unlocks at a higher advertiser level'),
    'err_package_locked', COALESCE(NULLIF(trim(value->>'err_package_locked'), ''), 'This package needs a higher advertiser level'),
    'err_package_invalid', COALESCE(NULLIF(trim(value->>'err_package_invalid'), ''), 'Choose a valid package'),
    'err_media_daily_min', COALESCE(NULLIF(trim(value->>'err_media_daily_min'), ''), 'Daily media budget is below the minimum for your level'),
    'marketplace_unavailable', COALESCE(NULLIF(trim(value->>'marketplace_unavailable'), ''), 'Ad marketplace settings are temporarily unavailable')
  ),
  updated_at = NOW()
WHERE key = 'ad_runtime_chrome';

-- Admin progression chrome for marketplace controls.
UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{progression}',
  COALESCE(value->'progression', '{}'::jsonb)
  || jsonb_build_object(
    'marketplace_section_title', COALESCE(NULLIF(trim(value->'progression'->>'marketplace_section_title'), ''), 'Ad marketplace'),
    'marketplace_section_blurb', COALESCE(NULLIF(trim(value->'progression'->>'marketplace_section_blurb'), ''), 'Control auction, reservation, floors, inventory multipliers, advertiser levels, agency percent, and wallet settle. Existing create fees and unit cost still apply.'),
    'marketplace_enabled_label', COALESCE(NULLIF(trim(value->'progression'->>'marketplace_enabled_label'), ''), 'Marketplace enabled'),
    'auction_enabled_label', COALESCE(NULLIF(trim(value->'progression'->>'auction_enabled_label'), ''), 'Auction enabled'),
    'reservation_enabled_label', COALESCE(NULLIF(trim(value->'progression'->>'reservation_enabled_label'), ''), 'Reservation enabled'),
    'default_buying_type_label', COALESCE(NULLIF(trim(value->'progression'->>'default_buying_type_label'), ''), 'Default buying type'),
    'floor_cpm_label', COALESCE(NULLIF(trim(value->'progression'->>'floor_cpm_label'), ''), 'Floor CPM'),
    'placement_lobby_multiplier_label', COALESCE(NULLIF(trim(value->'progression'->>'placement_lobby_multiplier_label'), ''), 'Lobby multiplier'),
    'placement_in_match_multiplier_label', COALESCE(NULLIF(trim(value->'progression'->>'placement_in_match_multiplier_label'), ''), 'In-match multiplier'),
    'viewport_desktop_multiplier_label', COALESCE(NULLIF(trim(value->'progression'->>'viewport_desktop_multiplier_label'), ''), 'Desktop multiplier'),
    'viewport_tablet_multiplier_label', COALESCE(NULLIF(trim(value->'progression'->>'viewport_tablet_multiplier_label'), ''), 'Tablet multiplier'),
    'viewport_mobile_multiplier_label', COALESCE(NULLIF(trim(value->'progression'->>'viewport_mobile_multiplier_label'), ''), 'Mobile multiplier'),
    'peak_hour_multiplier_label', COALESCE(NULLIF(trim(value->'progression'->>'peak_hour_multiplier_label'), ''), 'Peak hour multiplier'),
    'peak_hours_utc_label', COALESCE(NULLIF(trim(value->'progression'->>'peak_hours_utc_label'), ''), 'Peak hours (UTC start-end)'),
    'dynamic_floor_enabled_label', COALESCE(NULLIF(trim(value->'progression'->>'dynamic_floor_enabled_label'), ''), 'Dynamic floor enabled'),
    'dynamic_floor_fill_pct_label', COALESCE(NULLIF(trim(value->'progression'->>'dynamic_floor_fill_pct_label'), ''), 'Dynamic floor fill %'),
    'dynamic_floor_boost_label', COALESCE(NULLIF(trim(value->'progression'->>'dynamic_floor_boost_label'), ''), 'Dynamic floor boost'),
    'agency_enabled_label', COALESCE(NULLIF(trim(value->'progression'->>'agency_enabled_label'), ''), 'Agency mode enabled'),
    'agency_spend_percent_label', COALESCE(NULLIF(trim(value->'progression'->>'agency_spend_percent_label'), ''), 'Agency spend percent'),
    'impression_wallet_settle_label', COALESCE(NULLIF(trim(value->'progression'->>'impression_wallet_settle_label'), ''), 'Debit wallet per impression'),
    'impression_wallet_settle_blurb', COALESCE(NULLIF(trim(value->'progression'->>'impression_wallet_settle_blurb'), ''), 'Off by default. When on, each recorded view also debits the publisher wallet by the effective CPM share. Create fee is unchanged.'),
    'tiers_section_title', COALESCE(NULLIF(trim(value->'progression'->>'tiers_section_title'), ''), 'Advertiser levels'),
    'tiers_section_blurb', COALESCE(NULLIF(trim(value->'progression'->>'tiers_section_blurb'), ''), 'Levels follow recent spend on Dama. Do not gate on company capital claims.'),
    'packages_admin_title', COALESCE(NULLIF(trim(value->'progression'->>'packages_admin_title'), ''), 'Ad packages'),
    'packages_admin_blurb', COALESCE(NULLIF(trim(value->'progression'->>'packages_admin_blurb'), ''), 'Enable or edit premium packages publishers can buy. Public titles and blurbs only.'),
    'err_marketplace_invalid', COALESCE(NULLIF(trim(value->'progression'->>'err_marketplace_invalid'), ''), 'Marketplace settings are incomplete or invalid')
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';

-- Optional ledger kind for impression settle (additive; only used when settle flag on).
UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{wallet_ledger_kinds}',
  (
    SELECT COALESCE(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    FROM (
      SELECT DISTINCT trim(both '"' from v::text) AS x
      FROM jsonb_array_elements_text(
        COALESCE(value->'wallet_ledger_kinds', '[]'::jsonb)
        || '["campaign_impression"]'::jsonb
      ) AS v
      WHERE length(trim(both '"' from v::text)) > 0
    ) d
  )
),
updated_at = NOW()
WHERE key = 'client_enums'
  AND NOT (COALESCE(value->'wallet_ledger_kinds', '[]'::jsonb) ? 'campaign_impression');

UPDATE platform_settings
SET value = value
  || jsonb_build_object(
    'list_kind_campaign_impression', COALESCE(
      NULLIF(trim(value->>'list_kind_campaign_impression'), ''),
      'Ad impression'
    )
  ),
  updated_at = NOW()
WHERE key = 'wallet_chrome';
