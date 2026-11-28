export 'package:dama_mobile/graphql/schema_types.dart'
    show GAdCampaign, GPublisherDashboard;

/// Geo-resolved `GET /ads/pricing` for publisher create (marketplace + create fee).
class PublisherAdPricing {
  const PublisherAdPricing({
    required this.impressionUnitCost,
    required this.campaignCreateFeeAmount,
    required this.campaignCreateFeeCurrency,
    this.marketplaceEnabled = false,
    this.auctionEnabled = false,
    this.reservationEnabled = false,
    this.defaultBuyingType = '',
    this.floorCpm = 0,
    this.advertiserTierCode = '',
    this.advertiserTierLabel = '',
    this.advertiserTierBlurb = '',
    this.mediaDailyMin = 0,
    this.unlockPackages = false,
    this.agencyEnabled = false,
  });

  final double impressionUnitCost;
  final double campaignCreateFeeAmount;
  final String campaignCreateFeeCurrency;
  final bool marketplaceEnabled;
  final bool auctionEnabled;
  final bool reservationEnabled;
  final String defaultBuyingType;
  final double floorCpm;
  final String advertiserTierCode;
  final String advertiserTierLabel;
  final String advertiserTierBlurb;
  final double mediaDailyMin;
  final bool unlockPackages;
  final bool agencyEnabled;

  static PublisherAdPricing? tryFromJson(Map<String, dynamic> json) {
    final impression = json['impression_unit_cost'];
    final fee = json['campaign_create_fee_amount'];
    final currency =
        (json['campaign_create_fee_currency'] as String? ?? '').trim();
    if (impression is! num || impression <= 0) return null;
    // 0 create fee is valid when an advertiser tier waives it.
    if (fee is! num || fee < 0) return null;
    if (currency.isEmpty) return null;
    final floorRaw = json['floor_cpm'];
    final mediaMinRaw = json['media_daily_min'];
    return PublisherAdPricing(
      impressionUnitCost: impression.toDouble(),
      campaignCreateFeeAmount: fee.toDouble(),
      campaignCreateFeeCurrency: currency.toUpperCase(),
      marketplaceEnabled: json['marketplace_enabled'] == true,
      auctionEnabled: json['auction_enabled'] == true,
      reservationEnabled: json['reservation_enabled'] == true,
      defaultBuyingType: (json['default_buying_type'] as String? ?? '').trim(),
      floorCpm: floorRaw is num ? floorRaw.toDouble() : 0,
      advertiserTierCode:
          (json['advertiser_tier_code'] as String? ?? '').trim(),
      advertiserTierLabel:
          (json['advertiser_tier_label'] as String? ?? '').trim(),
      advertiserTierBlurb:
          (json['advertiser_tier_blurb'] as String? ?? '').trim(),
      mediaDailyMin: mediaMinRaw is num ? mediaMinRaw.toDouble() : 0,
      unlockPackages: json['unlock_packages'] == true,
      agencyEnabled: json['agency_enabled'] == true,
    );
  }
}

/// Public package from `GET /ads/packages`.
class AdPackage {
  const AdPackage({
    required this.code,
    required this.title,
    this.blurb = '',
    this.buyingType = '',
    this.fixedCpm = 0,
    this.flightFee = 0,
    this.minTier = '',
    this.placement = '',
    this.enabled = false,
    this.sortOrder = 0,
    this.exclusive = false,
    this.exclusiveCategory = '',
    this.lobbyTakeover = false,
  });

  final String code;
  final String title;
  final String blurb;
  final String buyingType;
  final double fixedCpm;
  final double flightFee;
  final String minTier;
  final String placement;
  final bool enabled;
  final int sortOrder;
  final bool exclusive;
  final String exclusiveCategory;
  /// Phase C: soft-interrupt lobby inventory SKU.
  final bool lobbyTakeover;

  factory AdPackage.fromJson(Map<String, dynamic> json) {
    final fixedRaw = json['fixed_cpm'];
    final feeRaw = json['flight_fee'];
    final sortRaw = json['sort_order'];
    // Strict true only (web/admin Phase C stamp parity).
    return AdPackage(
      code: (json['code'] as String? ?? '').trim(),
      title: (json['title'] as String? ?? '').trim(),
      blurb: (json['blurb'] as String? ?? '').trim(),
      buyingType: (json['buying_type'] as String? ?? '').trim(),
      fixedCpm: fixedRaw is num ? fixedRaw.toDouble() : 0,
      flightFee: feeRaw is num ? feeRaw.toDouble() : 0,
      minTier: (json['min_tier'] as String? ?? '').trim(),
      placement: (json['placement'] as String? ?? '').trim(),
      enabled: json['enabled'] == true,
      sortOrder: sortRaw is num ? sortRaw.toInt() : 0,
      exclusive: json['exclusive'] == true,
      exclusiveCategory: (json['exclusive_category'] as String? ?? '').trim(),
      lobbyTakeover: json['lobby_takeover'] == true,
    );
  }
}

/// Viewport creative fields on campaign list/detail and served payloads.
class ViewportCreativeSource {
  const ViewportCreativeSource({
    this.creativeUrl,
    this.videoId,
    this.creativeDesktopUrl,
    this.creativeTabletUrl,
    this.creativeMobileUrl,
    this.videoIdDesktop,
    this.videoIdTablet,
    this.videoIdMobile,
  });

  final String? creativeUrl;
  final String? videoId;
  final String? creativeDesktopUrl;
  final String? creativeTabletUrl;
  final String? creativeMobileUrl;
  final String? videoIdDesktop;
  final String? videoIdTablet;
  final String? videoIdMobile;
}

/// Geo-targeted ad row from `GET /ads/serve`.
class ServedAdCampaign {
  const ServedAdCampaign({
    required this.id,
    this.title,
    this.creativeUrl,
    this.videoId,
    this.creativeDesktopUrl,
    this.creativeTabletUrl,
    this.creativeMobileUrl,
    this.videoIdDesktop,
    this.videoIdTablet,
    this.videoIdMobile,
    this.packageCode,
    this.lobbyTakeover = false,
  });

  final String id;
  final String? title;
  final String? creativeUrl;
  final String? videoId;
  final String? creativeDesktopUrl;
  final String? creativeTabletUrl;
  final String? creativeMobileUrl;
  final String? videoIdDesktop;
  final String? videoIdTablet;
  final String? videoIdMobile;
  final String? packageCode;
  /// Phase C: prefer for lobby soft interstitial when package is lobby takeover.
  final bool lobbyTakeover;

  factory ServedAdCampaign.fromJson(Map<String, dynamic> json) {
    return ServedAdCampaign(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString(),
      creativeUrl: json['creative_url']?.toString(),
      videoId: json['video_id']?.toString(),
      creativeDesktopUrl: json['creative_desktop_url']?.toString(),
      creativeTabletUrl: json['creative_tablet_url']?.toString(),
      creativeMobileUrl: json['creative_mobile_url']?.toString(),
      videoIdDesktop: json['video_id_desktop']?.toString(),
      videoIdTablet: json['video_id_tablet']?.toString(),
      videoIdMobile: json['video_id_mobile']?.toString(),
      packageCode: json['package_code']?.toString(),
      // Strict true only (web soft prefer + serve stamp parity).
      lobbyTakeover: json['lobby_takeover'] == true,
    );
  }
}

class AdsServeResponse {
  const AdsServeResponse({this.campaigns = const []});

  final List<ServedAdCampaign> campaigns;

  ServedAdCampaign? get firstOrNull =>
      campaigns.isEmpty ? null : campaigns.first;

  factory AdsServeResponse.fromJson(Map<String, dynamic> json) {
    final list = json['campaigns'] as List<dynamic>? ?? [];
    return AdsServeResponse(
      campaigns: list
          .whereType<Map<String, dynamic>>()
          .map(ServedAdCampaign.fromJson)
          .where((c) => c.id.isNotEmpty)
          .toList(),
    );
  }
}
