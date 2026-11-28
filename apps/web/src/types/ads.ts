import type { PublisherDashboardQuery } from "@/gql/graphql";

export type AdCampaign = {
  id: string;
  title: string;
  status: string;
  status_label?: string;
  creative_type: string;
  /** DB label from client_enums.creative_type_labels; fail-closed UI uses empty_value when missing. */
  creative_type_label?: string;
  creative_url?: string;
  video_id?: string;
  creative_desktop_url?: string;
  creative_tablet_url?: string;
  creative_mobile_url?: string;
  video_id_desktop?: string;
  video_id_tablet?: string;
  video_id_mobile?: string;
  thumbnail_url?: string | null;
  gallery?: string[];
  daily_spend_cap?: number | null;
  impressions: number;
  clicks: number;
  unique_reach?: number;
  video_completions?: number;
  schedule_enabled?: boolean;
  first_show_after_seconds?: number | null;
  interval_seconds?: number | null;
  non_skippable_seconds?: number | null;
  daily_impression_cap?: number | null;
  weekly_impression_cap?: number | null;
  monthly_impression_cap?: number | null;
  yearly_impression_cap?: number | null;
  ends_at?: string | null;
  closed_at?: string | null;
  auto_closed?: boolean;
  buying_type?: string;
  bid_cpm?: number | null;
  reserved_cpm?: number | null;
  package_code?: string;
  agency_managed?: boolean;
  advertiser_tier_code?: string;
};

export type AdCampaignAnalyticsRow = {
  id: string;
  title: string;
  impressions: number;
  clicks: number;
  video_completions?: number;
  unique_reach?: number;
  status: string;
  status_label?: string;
  auto_closed?: boolean;
  ends_at?: string | null;
};

export type AdPricing = {
  impression_unit_cost: number;
  campaign_create_fee_amount: number;
  campaign_create_fee_currency: string;
  country_code?: string;
  marketplace_enabled?: boolean;
  auction_enabled?: boolean;
  reservation_enabled?: boolean;
  default_buying_type?: string;
  floor_cpm?: number;
  advertiser_tier_code?: string;
  advertiser_tier_label?: string;
  advertiser_tier_blurb?: string;
  media_daily_min?: number;
  unlock_packages?: boolean;
  agency_enabled?: boolean;
};

export type AdPackage = {
  code: string;
  title: string;
  blurb?: string;
  buying_type: string;
  fixed_cpm: number;
  flight_fee: number;
  min_tier: string;
  placement?: string;
  enabled: boolean;
  sort_order: number;
  exclusive?: boolean;
  exclusive_category?: string;
  /** Phase C: soft-interrupt lobby inventory SKU. */
  lobby_takeover?: boolean;
};

/** GraphQL `publisherDashboard` selection (codegen). */
export type PublisherDashboard = PublisherDashboardQuery["publisherDashboard"];
export type PublisherCampaign = PublisherDashboard["campaigns"][number];

export type CreateCampaignInput = {
  title: string;
  creativeType: string;
  geoCountry: string;
  geoRegion: string;
  geoDistrict: string;
  geoLat: string;
  geoLng: string;
  dailySpendCap: string;
  endsAt?: string;
  countryCode?: string;
  buyingType?: string;
  bidCpm?: string;
  reservedCpm?: string;
  packageCode?: string;
  agencyManaged?: boolean;
};

export type ServedAd = {
  id: string;
  title: string;
  creative_type?: string;
  creative_url?: string;
  video_id?: string;
  creative_desktop_url?: string;
  creative_tablet_url?: string;
  creative_mobile_url?: string;
  video_id_desktop?: string;
  video_id_tablet?: string;
  video_id_mobile?: string;
  package_code?: string;
  /** Phase C: prefer for lobby soft interstitial when package is lobby takeover. */
  lobby_takeover?: boolean;
};

export type ViewportCreativeSlot = "desktop" | "tablet" | "mobile";

export type AdServeGeoQuery = {
  country: string;
  region?: string;
  district?: string;
  lat?: number;
  lng?: number;
};
