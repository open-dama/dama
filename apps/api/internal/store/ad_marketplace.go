package store

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// AdCampaignCountryCode reads the first ISO country from stored geo_targets JSON.
func AdCampaignCountryCode(geo json.RawMessage) string {
	if len(geo) == 0 {
		return ""
	}
	var targets []map[string]any
	if err := json.Unmarshal(geo, &targets); err != nil || len(targets) == 0 {
		return ""
	}
	cc, _ := targets[0]["country"].(string)
	return strings.ToUpper(strings.TrimSpace(cc))
}

// AdvertiserTier is a spend-based level (not company capital).
type AdvertiserTier struct {
	Code                string  `json:"code"`
	Label               string  `json:"label"`
	Blurb               string  `json:"blurb,omitempty"`
	MonthlySpendMin     float64 `json:"monthly_spend_min"`
	CreateFeeMultiplier float64 `json:"create_fee_multiplier"`
	MediaDailyMin       float64 `json:"media_daily_min"`
	UnlockReservation   bool    `json:"unlock_reservation"`
	UnlockPackages      bool    `json:"unlock_packages"`
	ListCPMMultiplier   float64 `json:"list_cpm_multiplier"`
}

// AdPackage is a public premium package publishers can buy.
type AdPackage struct {
	Code       string  `json:"code"`
	Title      string  `json:"title"`
	Blurb      string  `json:"blurb,omitempty"`
	BuyingType string  `json:"buying_type"`
	FixedCPM   float64 `json:"fixed_cpm"`
	FlightFee  float64 `json:"flight_fee"`
	MinTier    string  `json:"min_tier"`
	Placement  string  `json:"placement,omitempty"`
	Enabled    bool    `json:"enabled"`
	SortOrder  int     `json:"sort_order"`
	// Exclusive: at most one campaign in ExclusiveCategory wins a serve slot (sponsorship).
	Exclusive         bool   `json:"exclusive"`
	ExclusiveCategory string `json:"exclusive_category,omitempty"`
}

const (
	BuyingTypeLegacy      = "legacy"
	BuyingTypeAuction     = "auction"
	BuyingTypeReservation = "reservation"
)

// MarketplaceDefaults fills optional marketplace fields when missing (fail open to safe defaults).
func (cfg *AdPricingConfig) MarketplaceDefaults() {
	if cfg == nil {
		return
	}
	if cfg.FloorCPM <= 0 {
		cfg.FloorCPM = cfg.ImpressionUnitCost
	}
	if cfg.FloorCPMEthiopia <= 0 {
		cfg.FloorCPMEthiopia = cfg.FloorCPM
	}
	if cfg.FloorCPMGlobal <= 0 {
		cfg.FloorCPMGlobal = cfg.FloorCPM
	}
	if cfg.PlacementLobbyMultiplier <= 0 {
		cfg.PlacementLobbyMultiplier = 1
	}
	if cfg.PlacementInMatchMultiplier <= 0 {
		cfg.PlacementInMatchMultiplier = 1.5
	}
	if cfg.ViewportDesktopMultiplier <= 0 {
		cfg.ViewportDesktopMultiplier = 1
	}
	if cfg.ViewportTabletMultiplier <= 0 {
		cfg.ViewportTabletMultiplier = 1
	}
	if cfg.ViewportMobileMultiplier <= 0 {
		cfg.ViewportMobileMultiplier = 1.1
	}
	if cfg.PeakHourMultiplier <= 0 {
		cfg.PeakHourMultiplier = 1.25
	}
	if cfg.PeakHoursUTCEnd <= cfg.PeakHoursUTCStart {
		cfg.PeakHoursUTCStart = 17
		cfg.PeakHoursUTCEnd = 22
	}
	if cfg.DynamicFloorFillPct <= 0 {
		cfg.DynamicFloorFillPct = 70
	}
	if cfg.DynamicFloorBoost <= 0 {
		cfg.DynamicFloorBoost = 1.2
	}
	if cfg.AgencySpendPercent < 0 {
		cfg.AgencySpendPercent = 0
	}
	if cfg.AudienceHighRatingMin < 0 {
		cfg.AudienceHighRatingMin = 0
	}
	if cfg.AudienceHighRatingMultiplier <= 0 {
		cfg.AudienceHighRatingMultiplier = 1
	}
	defBuy := strings.TrimSpace(cfg.DefaultBuyingType)
	if !cfg.MarketplaceEnabled {
		if defBuy == "" {
			cfg.DefaultBuyingType = BuyingTypeAuction
		}
	} else {
		if defBuy == "" || defBuy == BuyingTypeLegacy {
			if cfg.AuctionEnabled {
				defBuy = BuyingTypeAuction
			} else if cfg.ReservationEnabled {
				defBuy = BuyingTypeReservation
			} else {
				defBuy = ""
			}
		}
		// Clamp defaults that point at a disabled buying mode.
		if defBuy == BuyingTypeAuction && !cfg.AuctionEnabled {
			if cfg.ReservationEnabled {
				defBuy = BuyingTypeReservation
			} else {
				defBuy = ""
			}
		}
		if defBuy == BuyingTypeReservation && !cfg.ReservationEnabled {
			if cfg.AuctionEnabled {
				defBuy = BuyingTypeAuction
			} else {
				defBuy = ""
			}
		}
		cfg.DefaultBuyingType = defBuy
	}
	if len(cfg.Tiers) == 0 {
		cfg.Tiers = []AdvertiserTier{
			{Code: "starter", Label: "Starter", MonthlySpendMin: 0, CreateFeeMultiplier: 1, MediaDailyMin: 0, ListCPMMultiplier: 1},
			{Code: "growth", Label: "Growth", MonthlySpendMin: 100, CreateFeeMultiplier: 1, MediaDailyMin: 5, UnlockReservation: true, UnlockPackages: true, ListCPMMultiplier: 1.1},
			{Code: "enterprise", Label: "Enterprise", MonthlySpendMin: 1000, CreateFeeMultiplier: 0, MediaDailyMin: 50, UnlockReservation: true, UnlockPackages: true, ListCPMMultiplier: 1.25},
		}
	}
	for i := range cfg.Tiers {
		if cfg.Tiers[i].ListCPMMultiplier <= 0 {
			cfg.Tiers[i].ListCPMMultiplier = 1
		}
		if cfg.Tiers[i].CreateFeeMultiplier < 0 {
			cfg.Tiers[i].CreateFeeMultiplier = 1
		}
		cfg.Tiers[i].Code = strings.ToLower(strings.TrimSpace(cfg.Tiers[i].Code))
	}
	sort.SliceStable(cfg.Tiers, func(i, j int) bool {
		return cfg.Tiers[i].MonthlySpendMin < cfg.Tiers[j].MonthlySpendMin
	})
}

// ResolveAdvertiserTier picks the highest tier whose monthly spend min is met.
func (cfg AdPricingConfig) ResolveAdvertiserTier(monthlySpend float64) AdvertiserTier {
	cfg.MarketplaceDefaults()
	chosen := cfg.Tiers[0]
	for _, t := range cfg.Tiers {
		if monthlySpend+1e-9 >= t.MonthlySpendMin {
			chosen = t
		}
	}
	return chosen
}

// TierByCode looks up a tier; empty if unknown.
func (cfg AdPricingConfig) TierByCode(code string) (AdvertiserTier, bool) {
	cfg.MarketplaceDefaults()
	code = strings.ToLower(strings.TrimSpace(code))
	for _, t := range cfg.Tiers {
		if t.Code == code {
			return t, true
		}
	}
	return AdvertiserTier{}, false
}

// BaseFloorCPMForCountry picks Ethiopia vs global floor (falls back to floor_cpm).
func (cfg AdPricingConfig) BaseFloorCPMForCountry(countryCode string) float64 {
	cfg.MarketplaceDefaults()
	cc := strings.ToUpper(strings.TrimSpace(countryCode))
	if cc == "ET" && cfg.FloorCPMEthiopia > 0 {
		return cfg.FloorCPMEthiopia
	}
	if cc != "" && cc != "ET" && cfg.FloorCPMGlobal > 0 {
		return cfg.FloorCPMGlobal
	}
	if cfg.FloorCPM > 0 {
		return cfg.FloorCPM
	}
	return cfg.ImpressionUnitCost
}

// EffectiveFloorCPM returns the live floor (peak + optional dynamic boost) using base floor_cpm.
func (cfg AdPricingConfig) EffectiveFloorCPM(now time.Time, fillPct float64) float64 {
	return cfg.EffectiveFloorCPMForCountry("", now, fillPct)
}

// EffectiveFloorCPMForCountry returns the live floor for a payer / campaign country.
func (cfg AdPricingConfig) EffectiveFloorCPMForCountry(countryCode string, now time.Time, fillPct float64) float64 {
	cfg.MarketplaceDefaults()
	floor := cfg.BaseFloorCPMForCountry(countryCode)
	if floor <= 0 {
		floor = cfg.ImpressionUnitCost
	}
	h := now.UTC().Hour()
	if h >= cfg.PeakHoursUTCStart && h < cfg.PeakHoursUTCEnd {
		floor *= cfg.PeakHourMultiplier
	}
	if cfg.DynamicFloorEnabled && fillPct >= cfg.DynamicFloorFillPct {
		floor *= cfg.DynamicFloorBoost
	}
	return floor
}

// ApplyAgencyMediaMultiplier raises media unit cost when agency management is on.
// Used for pacing and optional wallet settle only (not auction rank).
func (cfg AdPricingConfig) ApplyAgencyMediaMultiplier(eff float64, agencyManaged bool) float64 {
	if eff <= 0 || !agencyManaged || !cfg.AgencyEnabled || cfg.AgencySpendPercent <= 0 {
		return eff
	}
	return eff * (1 + cfg.AgencySpendPercent/100)
}

// ApplyAgencyCreateFee raises campaign create fee when agency management is on.
// Same percent as media; percent itself stays admin-only (never returned on public pricing).
func (cfg AdPricingConfig) ApplyAgencyCreateFee(fee float64, agencyManaged bool) float64 {
	if fee < 0 || !agencyManaged || !cfg.AgencyEnabled || cfg.AgencySpendPercent <= 0 {
		return fee
	}
	return fee * (1 + cfg.AgencySpendPercent/100)
}

// ApplyAudienceMultiplier raises cost when the viewer rating meets the high-audience threshold.
// Prices scarce high-rated attention; no-op when rating unknown or multiplier is 1.
func (cfg AdPricingConfig) ApplyAudienceMultiplier(eff float64, viewerRating int) float64 {
	cfg.MarketplaceDefaults()
	if eff <= 0 || viewerRating <= 0 || cfg.AudienceHighRatingMin <= 0 {
		return eff
	}
	if cfg.AudienceHighRatingMultiplier <= 1 {
		return eff
	}
	if viewerRating < cfg.AudienceHighRatingMin {
		return eff
	}
	return eff * cfg.AudienceHighRatingMultiplier
}

// EstimateCampaignMediaSpend is impressions × base rate (bid/reserved/unit) for publisher invoices.
// Does not invent placement/viewport/audience multipliers (those vary per view).
// When agencyManaged and agencySpendPercent > 0, applies the same media uplift used at settle.
func EstimateCampaignMediaSpend(c *AdCampaign, unitCost, agencySpendPercent float64) float64 {
	if c == nil || c.Impressions <= 0 {
		return 0
	}
	rate := unitCost
	bt := strings.TrimSpace(c.BuyingType)
	switch bt {
	case BuyingTypeAuction:
		if c.BidCPM != nil && *c.BidCPM > 0 {
			rate = *c.BidCPM
		}
	case BuyingTypeReservation:
		if c.ReservedCPM != nil && *c.ReservedCPM > 0 {
			rate = *c.ReservedCPM
		}
	}
	if rate <= 0 {
		return 0
	}
	if c.AgencyManaged && agencySpendPercent > 0 {
		rate *= 1 + agencySpendPercent/100
	}
	return float64(c.Impressions) * rate
}

// PlacementMultiplier returns lobby / in_match multiplier (1 if unknown).
func (cfg AdPricingConfig) PlacementMultiplier(placement string) float64 {
	cfg.MarketplaceDefaults()
	p := strings.TrimSpace(placement)
	switch p {
	case "in_match":
		return cfg.PlacementInMatchMultiplier
	default:
		return cfg.PlacementLobbyMultiplier
	}
}

// ViewportMultiplier returns desktop/tablet/mobile multiplier.
func (cfg AdPricingConfig) ViewportMultiplier(slot string) float64 {
	cfg.MarketplaceDefaults()
	switch strings.ToLower(strings.TrimSpace(slot)) {
	case "tablet":
		return cfg.ViewportTabletMultiplier
	case "mobile":
		return cfg.ViewportMobileMultiplier
	default:
		return cfg.ViewportDesktopMultiplier
	}
}

// MaxViewportMultiplier is the highest configured viewport multiplier.
// Used for serve/eligibility pacing so daily caps are not overrun by mobile/tablet.
func (cfg AdPricingConfig) MaxViewportMultiplier() float64 {
	cfg.MarketplaceDefaults()
	m := cfg.ViewportDesktopMultiplier
	if cfg.ViewportTabletMultiplier > m {
		m = cfg.ViewportTabletMultiplier
	}
	if cfg.ViewportMobileMultiplier > m {
		m = cfg.ViewportMobileMultiplier
	}
	if m <= 0 {
		return 1
	}
	return m
}

// PacingViewportSlot picks a viewport slot string for conservative daily-cap checks.
func (cfg AdPricingConfig) PacingViewportSlot() string {
	cfg.MarketplaceDefaults()
	max := cfg.MaxViewportMultiplier()
	switch {
	case cfg.ViewportMobileMultiplier+1e-12 >= max:
		return "mobile"
	case cfg.ViewportTabletMultiplier+1e-12 >= max:
		return "tablet"
	default:
		return "desktop"
	}
}

// CampaignEffectiveUnitCost is the pacing / ranking cost for one campaign.
// Legacy campaigns keep flat impression_unit_cost (existing behavior).
func (cfg AdPricingConfig) CampaignEffectiveUnitCost(c *AdCampaign, placement, viewport string, now time.Time, fillPct float64, tier AdvertiserTier) float64 {
	if c == nil {
		return cfg.ImpressionUnitCost
	}
	cfg.MarketplaceDefaults()
	bt := strings.TrimSpace(c.BuyingType)
	if bt == "" || bt == BuyingTypeLegacy || !cfg.MarketplaceEnabled {
		return cfg.ImpressionUnitCost
	}
	floor := cfg.EffectiveFloorCPMForCountry(AdCampaignCountryCode(c.GeoTargets), now, fillPct)
	base := floor
	switch bt {
	case BuyingTypeAuction:
		if c.BidCPM != nil && *c.BidCPM > 0 {
			base = math.Max(floor, *c.BidCPM)
		}
	case BuyingTypeReservation:
		if c.ReservedCPM != nil && *c.ReservedCPM > 0 {
			base = *c.ReservedCPM
		} else {
			base = math.Max(floor, cfg.ImpressionUnitCost)
		}
	}
	mult := cfg.PlacementMultiplier(placement) * cfg.ViewportMultiplier(viewport)
	if tier.ListCPMMultiplier > 0 {
		mult *= tier.ListCPMMultiplier
	}
	out := base * mult
	if out <= 0 {
		return cfg.ImpressionUnitCost
	}
	return out
}

// CampaignRankScore higher wins in auction-style serve ordering.
// Uses the same conservative viewport as pacing so rank and daily-cap costs stay aligned.
func (cfg AdPricingConfig) CampaignRankScore(c *AdCampaign, placement string, now time.Time, fillPct float64, tier AdvertiserTier) float64 {
	return cfg.CampaignEffectiveUnitCost(c, placement, cfg.PacingViewportSlot(), now, fillPct, tier)
}

// SanitizePackageBuyingTypes rewrites legacy/empty package buying_type when marketplace is on.
func SanitizePackageBuyingTypes(pkgs []AdPackage, marketplaceEnabled bool) []AdPackage {
	if !marketplaceEnabled || len(pkgs) == 0 {
		return pkgs
	}
	out := append([]AdPackage{}, pkgs...)
	for i := range out {
		bt := strings.TrimSpace(out[i].BuyingType)
		if bt == "" || bt == BuyingTypeLegacy {
			out[i].BuyingType = BuyingTypeReservation
		}
	}
	return out
}

// ValidateAdPackageRates rejects catalog rates that cannot clear create-time floor checks.
func ValidateAdPackageRates(pkgs []AdPackage, marketplaceEnabled bool) error {
	if !marketplaceEnabled {
		return nil
	}
	for _, p := range pkgs {
		if !p.Enabled {
			continue
		}
		if p.FixedCPM <= 0 {
			return fmt.Errorf("package %s needs a fixed rate above zero", strings.TrimSpace(p.Code))
		}
	}
	return nil
}

// ParseAdPackages unmarshals platform_settings ad_packages value.
func ParseAdPackages(raw []byte) ([]AdPackage, error) {
	var wrap struct {
		Packages []AdPackage `json:"packages"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		return nil, err
	}
	out := make([]AdPackage, 0, len(wrap.Packages))
	for _, p := range wrap.Packages {
		p.Code = strings.TrimSpace(p.Code)
		p.Title = strings.TrimSpace(p.Title)
		p.BuyingType = strings.TrimSpace(p.BuyingType)
		p.MinTier = strings.ToLower(strings.TrimSpace(p.MinTier))
		if p.Code == "" || p.Title == "" {
			continue
		}
		if p.BuyingType == "" {
			p.BuyingType = BuyingTypeReservation
		}
		out = append(out, p)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].SortOrder == out[j].SortOrder {
			return out[i].Code < out[j].Code
		}
		return out[i].SortOrder < out[j].SortOrder
	})
	return out, nil
}

// PublicPackages returns enabled packages only (safe for publishers).
func PublicPackages(all []AdPackage) []AdPackage {
	out := make([]AdPackage, 0, len(all))
	for _, p := range all {
		if p.Enabled {
			out = append(out, p)
		}
	}
	return out
}

// PackageByCode finds a package.
func PackageByCode(all []AdPackage, code string) (AdPackage, bool) {
	code = strings.TrimSpace(code)
	for _, p := range all {
		if p.Code == code {
			return p, true
		}
	}
	return AdPackage{}, false
}

// PackageFitsPlacement reports whether a package may serve in placement
// (lobby / in_match). Empty package placement means no restriction.
func PackageFitsPlacement(pkgPlacement, servePlacement string) bool {
	pkgPlacement = strings.TrimSpace(strings.ToLower(pkgPlacement))
	if pkgPlacement == "" {
		return true
	}
	servePlacement = strings.TrimSpace(strings.ToLower(servePlacement))
	return pkgPlacement == servePlacement
}

// CampaignFitsServePlacement gates package-bound campaigns to their catalog placement.
// Unknown/stale package codes fail open so legacy campaigns keep delivering.
func CampaignFitsServePlacement(c *AdCampaign, packages []AdPackage, servePlacement string) bool {
	if c == nil {
		return false
	}
	code := strings.TrimSpace(c.PackageCode)
	if code == "" {
		return true
	}
	pkg, ok := PackageByCode(packages, code)
	if !ok || !pkg.Enabled {
		return true
	}
	return PackageFitsPlacement(pkg.Placement, servePlacement)
}

// PackageExclusiveKey returns the exclusivity bucket for a package (empty = none).
func PackageExclusiveKey(pkg AdPackage) string {
	if !pkg.Exclusive {
		return ""
	}
	cat := strings.ToLower(strings.TrimSpace(pkg.ExclusiveCategory))
	if cat != "" {
		return cat
	}
	return "pkg:" + strings.ToLower(strings.TrimSpace(pkg.Code))
}

// ExclusiveBucketTaken reports whether another open campaign already holds exclKey.
// excludeID skips the campaign being updated (empty = none).
func ExclusiveBucketTaken(open []AdCampaign, packages []AdPackage, exclKey, excludeID string) bool {
	exclKey = strings.TrimSpace(strings.ToLower(exclKey))
	if exclKey == "" {
		return false
	}
	excludeID = strings.TrimSpace(excludeID)
	for _, c := range open {
		if excludeID != "" && c.ID == excludeID {
			continue
		}
		code := strings.TrimSpace(c.PackageCode)
		if code == "" {
			continue
		}
		pkg, ok := PackageByCode(packages, code)
		if !ok || !pkg.Enabled {
			continue
		}
		if PackageExclusiveKey(pkg) == exclKey {
			return true
		}
	}
	return false
}

// ApplyPackageExclusivity keeps the first (highest-ranked) campaign per exclusive bucket.
// ranked must already be sorted best-first. Non-exclusive campaigns always pass.
func ApplyPackageExclusivity(ranked []AdCampaign, packages []AdPackage) []AdCampaign {
	if len(ranked) == 0 {
		return ranked
	}
	seen := map[string]struct{}{}
	out := make([]AdCampaign, 0, len(ranked))
	for _, c := range ranked {
		code := strings.TrimSpace(c.PackageCode)
		if code == "" {
			out = append(out, c)
			continue
		}
		pkg, ok := PackageByCode(packages, code)
		if !ok {
			out = append(out, c)
			continue
		}
		key := PackageExclusiveKey(pkg)
		if key == "" {
			out = append(out, c)
			continue
		}
		if _, taken := seen[key]; taken {
			continue
		}
		seen[key] = struct{}{}
		out = append(out, c)
	}
	return out
}

// TierMeetsMin reports whether tier code is at least as high as minTier by MonthlySpendMin order.
func (cfg AdPricingConfig) TierMeetsMin(tierCode, minTier string) bool {
	cfg.MarketplaceDefaults()
	t, ok := cfg.TierByCode(tierCode)
	if !ok {
		return false
	}
	minTier = strings.ToLower(strings.TrimSpace(minTier))
	if minTier == "" {
		return true
	}
	m, ok := cfg.TierByCode(minTier)
	if !ok {
		return false
	}
	return t.MonthlySpendMin+1e-9 >= m.MonthlySpendMin
}
