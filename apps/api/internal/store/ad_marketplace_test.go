package store

import (
	"testing"
	"time"
)

func TestPackageFitsPlacement(t *testing.T) {
	if !PackageFitsPlacement("", "lobby") {
		t.Fatal("empty package placement should fit any serve placement")
	}
	if !PackageFitsPlacement("in_match", "in_match") {
		t.Fatal("matching placement should fit")
	}
	if PackageFitsPlacement("lobby", "in_match") {
		t.Fatal("lobby package must not serve in_match")
	}
}

func TestCampaignRankScoreAuctionBeatsFloor(t *testing.T) {
	cfg := AdPricingConfig{
		ImpressionUnitCost: 0.01,
		MarketplaceEnabled: true,
		AuctionEnabled:     true,
		FloorCPM:           0.02,
		Tiers: []AdvertiserTier{{
			Code: "starter", Label: "Starter", MonthlySpendMin: 0, CreateFeeMultiplier: 1,
			ListCPMMultiplier: 1, MediaDailyMin: 0,
		}},
	}
	cfg.MarketplaceDefaults()
	bid := 0.09
	high := &AdCampaign{BuyingType: BuyingTypeAuction, BidCPM: &bid}
	lowBid := 0.03
	low := &AdCampaign{BuyingType: BuyingTypeAuction, BidCPM: &lowBid}
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	tier := cfg.ResolveAdvertiserTier(0)
	hs := cfg.CampaignRankScore(high, "lobby", now, 0, tier)
	ls := cfg.CampaignRankScore(low, "lobby", now, 0, tier)
	if !(hs > ls) {
		t.Fatalf("higher bid should rank higher: high=%v low=%v", hs, ls)
	}
}

func TestCampaignEffectiveUnitCostInMatchMultiplier(t *testing.T) {
	cfg := AdPricingConfig{
		ImpressionUnitCost:         0.01,
		MarketplaceEnabled:         true,
		AuctionEnabled:             true,
		FloorCPM:                   0.02,
		PlacementLobbyMultiplier:   1,
		PlacementInMatchMultiplier: 2,
		Tiers: []AdvertiserTier{{
			Code: "starter", Label: "Starter", MonthlySpendMin: 0, CreateFeeMultiplier: 1,
			ListCPMMultiplier: 1,
		}},
	}
	cfg.MarketplaceDefaults()
	bid := 0.04
	c := &AdCampaign{BuyingType: BuyingTypeAuction, BidCPM: &bid}
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	tier := cfg.ResolveAdvertiserTier(0)
	lobby := cfg.CampaignEffectiveUnitCost(c, "lobby", "", now, 0, tier)
	inMatch := cfg.CampaignEffectiveUnitCost(c, "in_match", "", now, 0, tier)
	if inMatch < lobby*1.9 {
		t.Fatalf("in_match should apply ~2x multiplier: lobby=%v in_match=%v", lobby, inMatch)
	}
}

func TestCampaignFitsServePlacement(t *testing.T) {
	pkgs := []AdPackage{
		{Code: "home_spotlight", Placement: "lobby", Enabled: true},
		{Code: "live_board_boost", Placement: "in_match", Enabled: true},
	}
	lobbyCamp := &AdCampaign{PackageCode: "home_spotlight"}
	if !CampaignFitsServePlacement(lobbyCamp, pkgs, "lobby") {
		t.Fatal("home_spotlight should fit lobby")
	}
	if CampaignFitsServePlacement(lobbyCamp, pkgs, "in_match") {
		t.Fatal("home_spotlight must not fit in_match")
	}
	open := &AdCampaign{}
	if !CampaignFitsServePlacement(open, pkgs, "lobby") {
		t.Fatal("no package should fit any placement")
	}
	stale := &AdCampaign{PackageCode: "deleted_pkg"}
	if !CampaignFitsServePlacement(stale, pkgs, "lobby") {
		t.Fatal("unknown package_code must fail open for legacy delivery")
	}
}

func TestApplyPackageExclusivity(t *testing.T) {
	pkgs := []AdPackage{
		{Code: "tournament_season", Exclusive: true, ExclusiveCategory: "tournament", Enabled: true},
		{Code: "home_spotlight", Enabled: true},
	}
	a := AdCampaign{ID: "a", PackageCode: "tournament_season"}
	b := AdCampaign{ID: "b", PackageCode: "tournament_season"}
	c := AdCampaign{ID: "c", PackageCode: "home_spotlight"}
	d := AdCampaign{ID: "d"}
	out := ApplyPackageExclusivity([]AdCampaign{a, b, c, d}, pkgs)
	if len(out) != 3 {
		t.Fatalf("expected 3 after exclusivity, got %d", len(out))
	}
	if out[0].ID != "a" {
		t.Fatalf("first exclusive winner should be a, got %s", out[0].ID)
	}
}

func TestExclusiveBucketTakenIncludesDraftHolders(t *testing.T) {
	pkgs := []AdPackage{
		{Code: "tournament_season", Exclusive: true, ExclusiveCategory: "tournament", Enabled: true},
	}
	open := []AdCampaign{{ID: "draft1", PackageCode: "tournament_season", Status: "draft"}}
	if !ExclusiveBucketTaken(open, pkgs, "tournament", "") {
		t.Fatal("draft exclusive holder must block new booking")
	}
	if ExclusiveBucketTaken(open, pkgs, "tournament", "draft1") {
		t.Fatal("excludeID should allow updating the same campaign")
	}
}

func TestBaseFloorCPMForCountry(t *testing.T) {
	cfg := AdPricingConfig{
		ImpressionUnitCost: 0.01,
		FloorCPM:           0.02,
		FloorCPMEthiopia:   0.015,
		FloorCPMGlobal:     0.05,
	}
	cfg.MarketplaceDefaults()
	if got := cfg.BaseFloorCPMForCountry("ET"); got != 0.015 {
		t.Fatalf("ET floor want 0.015 got %v", got)
	}
	if got := cfg.BaseFloorCPMForCountry("US"); got != 0.05 {
		t.Fatalf("US floor want 0.05 got %v", got)
	}
	if got := cfg.BaseFloorCPMForCountry(""); got != 0.02 {
		t.Fatalf("empty country should use base floor_cpm, got %v", got)
	}
}

func TestApplyAgencyMediaMultiplier(t *testing.T) {
	cfg := AdPricingConfig{AgencyEnabled: true, AgencySpendPercent: 10}
	if got := cfg.ApplyAgencyMediaMultiplier(1.0, true); got < 1.09 || got > 1.11 {
		t.Fatalf("agency 10%% should raise 1.0 to ~1.1, got %v", got)
	}
	if got := cfg.ApplyAgencyMediaMultiplier(1.0, false); got != 1.0 {
		t.Fatalf("non-agency must stay 1.0, got %v", got)
	}
}

func TestApplyAgencyCreateFee(t *testing.T) {
	cfg := AdPricingConfig{AgencyEnabled: true, AgencySpendPercent: 10}
	if got := cfg.ApplyAgencyCreateFee(100, true); got < 109.9 || got > 110.1 {
		t.Fatalf("agency 10%% should raise 100 to ~110, got %v", got)
	}
	if got := cfg.ApplyAgencyCreateFee(100, false); got != 100 {
		t.Fatalf("non-agency must stay 100, got %v", got)
	}
	cfg.AgencyEnabled = false
	if got := cfg.ApplyAgencyCreateFee(100, true); got != 100 {
		t.Fatalf("agency disabled must stay 100, got %v", got)
	}
}

func TestPacingViewportSlotUsesMax(t *testing.T) {
	cfg := AdPricingConfig{
		ViewportDesktopMultiplier: 1,
		ViewportTabletMultiplier:  1.2,
		ViewportMobileMultiplier:  1.5,
	}
	cfg.MarketplaceDefaults()
	if got := cfg.PacingViewportSlot(); got != "mobile" {
		t.Fatalf("want mobile pacing slot, got %s", got)
	}
	if got := cfg.MaxViewportMultiplier(); got != 1.5 {
		t.Fatalf("want max 1.5, got %v", got)
	}
}

func TestApplyAudienceMultiplier(t *testing.T) {
	cfg := AdPricingConfig{
		AudienceHighRatingMin:        1600,
		AudienceHighRatingMultiplier: 1.15,
	}
	cfg.MarketplaceDefaults()
	if got := cfg.ApplyAudienceMultiplier(1.0, 1500); got != 1.0 {
		t.Fatalf("below min should stay 1.0, got %v", got)
	}
	if got := cfg.ApplyAudienceMultiplier(1.0, 1600); got < 1.14 || got > 1.16 {
		t.Fatalf("at min should ~1.15, got %v", got)
	}
	if got := cfg.ApplyAudienceMultiplier(1.0, 0); got != 1.0 {
		t.Fatalf("unknown rating should stay 1.0, got %v", got)
	}
}

func TestEstimateCampaignMediaSpend(t *testing.T) {
	bid := 0.05
	c := &AdCampaign{BuyingType: BuyingTypeAuction, BidCPM: &bid, Impressions: 100}
	if got := EstimateCampaignMediaSpend(c, 0.01, 0); got < 4.9 || got > 5.1 {
		t.Fatalf("want ~5.0, got %v", got)
	}
	c.AgencyManaged = true
	if got := EstimateCampaignMediaSpend(c, 0.01, 10); got < 5.4 || got > 5.6 {
		t.Fatalf("agency 10%% want ~5.5, got %v", got)
	}
}

func TestSanitizePackageBuyingTypes(t *testing.T) {
	in := []AdPackage{
		{Code: "a", Title: "A", BuyingType: BuyingTypeLegacy},
		{Code: "b", Title: "B", BuyingType: BuyingTypeAuction},
		{Code: "c", Title: "C", BuyingType: ""},
	}
	got := SanitizePackageBuyingTypes(in, true)
	if got[0].BuyingType != BuyingTypeReservation {
		t.Fatalf("legacy should become reservation, got %s", got[0].BuyingType)
	}
	if got[1].BuyingType != BuyingTypeAuction {
		t.Fatalf("auction package must stay auction, got %s", got[1].BuyingType)
	}
	if got[2].BuyingType != BuyingTypeReservation {
		t.Fatalf("empty should become reservation, got %s", got[2].BuyingType)
	}
	unchanged := SanitizePackageBuyingTypes(in, false)
	if unchanged[0].BuyingType != BuyingTypeLegacy {
		t.Fatalf("marketplace off must leave legacy, got %s", unchanged[0].BuyingType)
	}
}

func TestValidateAdPackageRates(t *testing.T) {
	ok := []AdPackage{{Code: "ok", Enabled: true, FixedCPM: 0.05}}
	if err := ValidateAdPackageRates(ok, true); err != nil {
		t.Fatalf("valid package: %v", err)
	}
	bad := []AdPackage{{Code: "bad", Enabled: true, FixedCPM: 0}}
	if err := ValidateAdPackageRates(bad, true); err == nil {
		t.Fatal("enabled package with zero fixed_cpm must fail")
	}
	disabled := []AdPackage{{Code: "off", Enabled: false, FixedCPM: 0}}
	if err := ValidateAdPackageRates(disabled, true); err != nil {
		t.Fatalf("disabled package may keep zero rate: %v", err)
	}
	if err := ValidateAdPackageRates(bad, false); err != nil {
		t.Fatalf("marketplace off skips rate validation: %v", err)
	}
}

func TestMarketplaceDefaultsLegacyWhenModesOff(t *testing.T) {
	cfg := AdPricingConfig{
		MarketplaceEnabled: true,
		AuctionEnabled:     false,
		ReservationEnabled: false,
		DefaultBuyingType:  BuyingTypeLegacy,
	}
	cfg.MarketplaceDefaults()
	if cfg.DefaultBuyingType != "" {
		t.Fatalf("both modes off must clear legacy default, got %q", cfg.DefaultBuyingType)
	}
	cfg = AdPricingConfig{
		MarketplaceEnabled: true,
		AuctionEnabled:     false,
		ReservationEnabled: true,
		DefaultBuyingType:  BuyingTypeAuction,
	}
	cfg.MarketplaceDefaults()
	if cfg.DefaultBuyingType != BuyingTypeReservation {
		t.Fatalf("auction disabled should clamp to reservation, got %q", cfg.DefaultBuyingType)
	}
}

func TestCampaignRankScoreIgnoresAudienceAndAgency(t *testing.T) {
	cfg := AdPricingConfig{
		ImpressionUnitCost:           0.01,
		MarketplaceEnabled:           true,
		AuctionEnabled:               true,
		FloorCPM:                     0.02,
		AgencyEnabled:                true,
		AgencySpendPercent:           10,
		AudienceHighRatingMin:        1600,
		AudienceHighRatingMultiplier: 1.15,
		Tiers: []AdvertiserTier{{
			Code: "starter", Label: "Starter", MonthlySpendMin: 0, CreateFeeMultiplier: 1,
			ListCPMMultiplier: 1, MediaDailyMin: 0,
		}},
	}
	cfg.MarketplaceDefaults()
	bid := 0.09
	c := &AdCampaign{BuyingType: BuyingTypeAuction, BidCPM: &bid, AgencyManaged: true}
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	tier := cfg.ResolveAdvertiserTier(0)
	rank := cfg.CampaignRankScore(c, "lobby", now, 0, tier)
	eff := cfg.CampaignEffectiveUnitCost(c, "lobby", cfg.PacingViewportSlot(), now, 0, tier)
	eff = cfg.ApplyAgencyMediaMultiplier(eff, true)
	eff = cfg.ApplyAudienceMultiplier(eff, 1600)
	if !(eff > rank) {
		t.Fatalf("pacing eff with agency+audience should exceed rank: rank=%v eff=%v", rank, eff)
	}
	if rank <= 0 {
		t.Fatalf("rank must stay positive, got %v", rank)
	}
}
