-- Heal marketplace public + admin copy so labels match pacing units (per view, same as daily budget).
-- Adds fail-closed chrome for impression wallet settle when that admin flag is on.
-- Additive; does not change legacy create-fee or flat impression_unit_cost math.

UPDATE platform_settings
SET value = value || jsonb_build_object(
  'buying_type_auction_blurb', 'Flexible. You set a max price per view. When others bid higher for the same spot, they may show first.',
  'buying_type_reservation_blurb', 'Book a premium spot at a fixed price per view. More predictable than auction.',
  'bid_cpm_label', 'Max bid (per view)',
  'bid_cpm_blurb', 'Highest amount you are willing to pay per view. Must meet the floor price. Uses the same units as your daily budget.',
  'reserved_cpm_label', 'Reserved rate (per view)',
  'reserved_cpm_blurb', 'Fixed price per view for this reserved flight. Uses the same units as your daily budget.',
  'floor_cpm_label', 'Floor price',
  'floor_cpm_blurb', 'Minimum price per view right now. Peak hours and busy inventory can raise this.',
  'err_impression_wallet_insufficient', 'Not enough wallet balance to run this ad view. Top up and try again.'
),
updated_at = NOW()
WHERE key = 'ad_runtime_chrome';

UPDATE platform_settings
SET value = jsonb_set(
  value,
  '{progression}',
  COALESCE(value->'progression', '{}'::jsonb)
  || jsonb_build_object(
    'floor_cpm_label', 'Floor rate (per view)',
    'floor_cpm_ethiopia_label', 'Floor rate Ethiopia (per view)',
    'floor_cpm_ethiopia_blurb', 'Minimum price per view for Ethiopia campaigns. Peak hours and busy inventory can still raise this.',
    'floor_cpm_global_label', 'Floor rate Global (per view)',
    'floor_cpm_global_blurb', 'Minimum price per view for campaigns outside Ethiopia. Peak hours and busy inventory can still raise this.',
    'package_fixed_cpm_label', 'Package fixed rate (per view)',
    'tier_list_cpm_multiplier_label', 'List rate multiplier',
    'impression_wallet_settle_blurb', 'Off by default. When on, each recorded view also debits the publisher wallet by the effective per-view rate (same units as daily budget). Create fee is unchanged. Views are blocked when the wallet cannot cover the rate.'
  ),
  true
),
updated_at = NOW()
WHERE key = 'admin_console_chrome';
