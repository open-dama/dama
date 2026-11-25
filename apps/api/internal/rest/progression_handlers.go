package rest

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"dama/apps/api/internal/auth"
	"dama/apps/api/internal/store"
)

type ProgressionAPI struct {
	Settings *store.SettingsStore
	Audit    *store.AuditStore
}

// Public returns DB-backed XP ladder + match clock (no client hardcodes).
// Play clients only see enabled time-control presets.
func (a *ProgressionAPI) Public(w http.ResponseWriter, r *http.Request) {
	if a.Settings == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "progression config unavailable"})
		return
	}
	levels := a.Settings.XPLevels()
	clock := a.Settings.MatchClock()
	rewards := a.Settings.MatchRewards()
	if levels.Source != "database" || clock.Source != "database" || rewards.Source != "database" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "progression config unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, progressionPayload(levels, clock, rewards, false))
}

// ConsoleGet returns progression + ad pricing for admin console hydration.
func (a *ProgressionAPI) ConsoleGet(w http.ResponseWriter, r *http.Request) {
	if a.Settings == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "progression config unavailable"})
		return
	}
	levels := a.Settings.XPLevels()
	clock := a.Settings.MatchClock()
	ads := a.Settings.AdPricing()
	rewards := a.Settings.MatchRewards()
	if levels.Source != "database" || clock.Source != "database" || ads.Source != "database" || rewards.Source != "database" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "platform settings unavailable"})
		return
	}
	// Always return progression; web_app_origin may be empty so admin can set it (no chicken-egg 503).
	writeJSON(w, http.StatusOK, consolePlatformPayload(r.Context(), a.Settings))
}

type progressionPutBody struct {
	XPLevels []struct {
		MinXP int    `json:"min_xp"`
		Label string `json:"label"`
	} `json:"xp_levels"`
	MatchClock *struct {
		Enabled          bool `json:"enabled"`
		InitialSeconds   int  `json:"initial_seconds"`
		IncrementSeconds int  `json:"increment_seconds"`
		InviteTTLSeconds int  `json:"invite_ttl_seconds"`
		// Pointers so an admin save that omits pause fields keeps the stored config.
		PauseEnabled         *bool `json:"pause_enabled"`
		PauseDurationSeconds *int  `json:"pause_duration_seconds"`
		// Nil → keep stored presets; non-nil replaces (soft-disable via enabled=false).
		Presets *[]store.MatchClockPreset `json:"presets"`
	} `json:"match_clock"`
	AdPricing *struct {
		ImpressionUnitCost                float64 `json:"impression_unit_cost"`
		CampaignCreateFeeEthiopiaAmount   float64 `json:"campaign_create_fee_ethiopia_amount"`
		CampaignCreateFeeEthiopiaCurrency string  `json:"campaign_create_fee_ethiopia_currency"`
		CampaignCreateFeeGlobalAmount     float64 `json:"campaign_create_fee_global_amount"`
		CampaignCreateFeeGlobalCurrency   string  `json:"campaign_create_fee_global_currency"`
		// Marketplace (optional on PUT; omitted fields keep stored values).
		MarketplaceEnabled            *bool                   `json:"marketplace_enabled"`
		AuctionEnabled                *bool                   `json:"auction_enabled"`
		ReservationEnabled            *bool                   `json:"reservation_enabled"`
		DefaultBuyingType             *string                 `json:"default_buying_type"`
		FloorCPM                      *float64                `json:"floor_cpm"`
		FloorCPMEthiopia              *float64                `json:"floor_cpm_ethiopia"`
		FloorCPMGlobal                *float64                `json:"floor_cpm_global"`
		PlacementLobbyMultiplier      *float64                `json:"placement_lobby_multiplier"`
		PlacementInMatchMultiplier    *float64                `json:"placement_in_match_multiplier"`
		ViewportDesktopMultiplier     *float64                `json:"viewport_desktop_multiplier"`
		ViewportTabletMultiplier      *float64                `json:"viewport_tablet_multiplier"`
		ViewportMobileMultiplier      *float64                `json:"viewport_mobile_multiplier"`
		PeakHourMultiplier            *float64                `json:"peak_hour_multiplier"`
		PeakHoursUTCStart             *int                    `json:"peak_hours_utc_start"`
		PeakHoursUTCEnd               *int                    `json:"peak_hours_utc_end"`
		DynamicFloorEnabled           *bool                   `json:"dynamic_floor_enabled"`
		DynamicFloorFillPct           *float64                `json:"dynamic_floor_fill_pct"`
		DynamicFloorBoost             *float64                `json:"dynamic_floor_boost"`
		AgencyEnabled                 *bool                   `json:"agency_enabled"`
		AgencySpendPercent            *float64                `json:"agency_spend_percent"`
		ImpressionWalletSettleEnabled *bool                   `json:"impression_wallet_settle_enabled"`
		AudienceHighRatingMin         *int                    `json:"audience_high_rating_min"`
		AudienceHighRatingMultiplier  *float64                `json:"audience_high_rating_multiplier"`
		Tiers                         *[]store.AdvertiserTier `json:"tiers"`
	} `json:"ad_pricing"`
	AdPackages   *[]store.AdPackage `json:"ad_packages"`
	MatchRewards *struct {
		WinXP          int `json:"win_xp"`
		DrawXP         int `json:"draw_xp"`
		LossXP         int `json:"loss_xp"`
		WinRating      int `json:"win_rating"`
		DrawRating     int `json:"draw_rating"`
		LossRating     int `json:"loss_rating"`
		RatingFloor    int `json:"rating_floor"`
		StartingRating int `json:"starting_rating"`
	} `json:"match_rewards"`
	WebAppOrigin *string `json:"web_app_origin"`
}

// ConsolePut updates xp_levels, match_clock, match_rewards, and/or ad_pricing in platform_settings.
func (a *ProgressionAPI) ConsolePut(w http.ResponseWriter, r *http.Request) {
	if a.Settings == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "progression config unavailable"})
		return
	}
	var body progressionPutBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if body.XPLevels == nil && body.MatchClock == nil && body.AdPricing == nil && body.AdPackages == nil && body.MatchRewards == nil && body.WebAppOrigin == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "xp_levels, match_clock, match_rewards, ad_pricing, ad_packages, or web_app_origin required"})
		return
	}
	changed := map[string]any{}
	if body.XPLevels != nil {
		levels := make([]store.XPLevel, 0, len(body.XPLevels))
		for _, lvl := range body.XPLevels {
			levels = append(levels, store.XPLevel{MinXP: lvl.MinXP, Label: lvl.Label})
		}
		if err := a.Settings.SetXPLevels(r.Context(), store.XPLevelsConfig{Levels: levels}); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		changed["xp_levels"] = len(levels)
	}
	if body.MatchClock != nil {
		cur := a.Settings.MatchClock()
		cfg := store.MatchClockConfig{
			Enabled:              body.MatchClock.Enabled,
			InitialSeconds:       body.MatchClock.InitialSeconds,
			IncrementSeconds:     body.MatchClock.IncrementSeconds,
			InviteTTLSeconds:     body.MatchClock.InviteTTLSeconds,
			PauseEnabled:         cur.PauseEnabled,
			PauseDurationSeconds: cur.PauseDurationSeconds,
			Presets:              cur.Presets,
		}
		if body.MatchClock.PauseEnabled != nil {
			cfg.PauseEnabled = *body.MatchClock.PauseEnabled
		}
		if body.MatchClock.PauseDurationSeconds != nil {
			cfg.PauseDurationSeconds = *body.MatchClock.PauseDurationSeconds
		}
		if body.MatchClock.Presets != nil {
			cfg.Presets = append([]store.MatchClockPreset{}, (*body.MatchClock.Presets)...)
		}
		if err := a.Settings.SetMatchClock(r.Context(), cfg); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		after := a.Settings.MatchClock()
		changed["match_clock"] = map[string]any{
			"enabled":                after.Enabled,
			"initial_seconds":        after.InitialSeconds,
			"increment_seconds":      after.IncrementSeconds,
			"invite_ttl_seconds":     after.InviteTTLSeconds,
			"pause_enabled":          after.PauseEnabled,
			"pause_duration_seconds": after.PauseDurationSeconds,
			"presets":                after.Presets,
		}
	}
	if body.AdPricing != nil {
		cfg := a.Settings.AdPricing()
		cfg.ImpressionUnitCost = body.AdPricing.ImpressionUnitCost
		cfg.CampaignCreateFeeEthiopiaAmount = body.AdPricing.CampaignCreateFeeEthiopiaAmount
		cfg.CampaignCreateFeeEthiopiaCurrency = body.AdPricing.CampaignCreateFeeEthiopiaCurrency
		cfg.CampaignCreateFeeGlobalAmount = body.AdPricing.CampaignCreateFeeGlobalAmount
		cfg.CampaignCreateFeeGlobalCurrency = body.AdPricing.CampaignCreateFeeGlobalCurrency
		if body.AdPricing.MarketplaceEnabled != nil {
			cfg.MarketplaceEnabled = *body.AdPricing.MarketplaceEnabled
		}
		if body.AdPricing.AuctionEnabled != nil {
			cfg.AuctionEnabled = *body.AdPricing.AuctionEnabled
		}
		if body.AdPricing.ReservationEnabled != nil {
			cfg.ReservationEnabled = *body.AdPricing.ReservationEnabled
		}
		if body.AdPricing.DefaultBuyingType != nil {
			cfg.DefaultBuyingType = strings.TrimSpace(*body.AdPricing.DefaultBuyingType)
		}
		// Clamp default to enabled modes (empty when marketplace on and both modes off).
		// SetAdPricing also runs MarketplaceDefaults; keep this so invalid defaults never persist mid-handler.
		cfg.MarketplaceDefaults()
		if body.AdPricing.FloorCPM != nil {
			cfg.FloorCPM = *body.AdPricing.FloorCPM
		}
		if body.AdPricing.FloorCPMEthiopia != nil {
			cfg.FloorCPMEthiopia = *body.AdPricing.FloorCPMEthiopia
		}
		if body.AdPricing.FloorCPMGlobal != nil {
			cfg.FloorCPMGlobal = *body.AdPricing.FloorCPMGlobal
		}
		if body.AdPricing.PlacementLobbyMultiplier != nil {
			cfg.PlacementLobbyMultiplier = *body.AdPricing.PlacementLobbyMultiplier
		}
		if body.AdPricing.PlacementInMatchMultiplier != nil {
			cfg.PlacementInMatchMultiplier = *body.AdPricing.PlacementInMatchMultiplier
		}
		if body.AdPricing.ViewportDesktopMultiplier != nil {
			cfg.ViewportDesktopMultiplier = *body.AdPricing.ViewportDesktopMultiplier
		}
		if body.AdPricing.ViewportTabletMultiplier != nil {
			cfg.ViewportTabletMultiplier = *body.AdPricing.ViewportTabletMultiplier
		}
		if body.AdPricing.ViewportMobileMultiplier != nil {
			cfg.ViewportMobileMultiplier = *body.AdPricing.ViewportMobileMultiplier
		}
		if body.AdPricing.PeakHourMultiplier != nil {
			cfg.PeakHourMultiplier = *body.AdPricing.PeakHourMultiplier
		}
		if body.AdPricing.PeakHoursUTCStart != nil {
			cfg.PeakHoursUTCStart = *body.AdPricing.PeakHoursUTCStart
		}
		if body.AdPricing.PeakHoursUTCEnd != nil {
			cfg.PeakHoursUTCEnd = *body.AdPricing.PeakHoursUTCEnd
		}
		if body.AdPricing.DynamicFloorEnabled != nil {
			cfg.DynamicFloorEnabled = *body.AdPricing.DynamicFloorEnabled
		}
		if body.AdPricing.DynamicFloorFillPct != nil {
			cfg.DynamicFloorFillPct = *body.AdPricing.DynamicFloorFillPct
		}
		if body.AdPricing.DynamicFloorBoost != nil {
			cfg.DynamicFloorBoost = *body.AdPricing.DynamicFloorBoost
		}
		if body.AdPricing.AgencyEnabled != nil {
			cfg.AgencyEnabled = *body.AdPricing.AgencyEnabled
		}
		if body.AdPricing.AgencySpendPercent != nil {
			cfg.AgencySpendPercent = *body.AdPricing.AgencySpendPercent
		}
		if body.AdPricing.ImpressionWalletSettleEnabled != nil {
			cfg.ImpressionWalletSettleEnabled = *body.AdPricing.ImpressionWalletSettleEnabled
		}
		if body.AdPricing.AudienceHighRatingMin != nil {
			cfg.AudienceHighRatingMin = *body.AdPricing.AudienceHighRatingMin
		}
		if body.AdPricing.AudienceHighRatingMultiplier != nil {
			cfg.AudienceHighRatingMultiplier = *body.AdPricing.AudienceHighRatingMultiplier
		}
		if body.AdPricing.Tiers != nil {
			cfg.Tiers = append([]store.AdvertiserTier{}, (*body.AdPricing.Tiers)...)
		}
		if err := a.Settings.SetAdPricing(r.Context(), cfg); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		changed["ad_pricing"] = true
	}
	if body.AdPackages != nil {
		pkgs := append([]store.AdPackage{}, (*body.AdPackages)...)
		mktOn := a.Settings.AdPricing().MarketplaceEnabled
		if body.AdPricing != nil && body.AdPricing.MarketplaceEnabled != nil {
			mktOn = *body.AdPricing.MarketplaceEnabled
		}
		pkgs = store.SanitizePackageBuyingTypes(pkgs, mktOn)
		if err := store.ValidateAdPackageRates(pkgs, mktOn); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		if err := a.Settings.SetAdPackages(r.Context(), pkgs); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		changed["ad_packages"] = true
	}
	if body.MatchRewards != nil {
		cfg := store.MatchRewardsConfig{
			WinXP:          body.MatchRewards.WinXP,
			DrawXP:         body.MatchRewards.DrawXP,
			LossXP:         body.MatchRewards.LossXP,
			WinRating:      body.MatchRewards.WinRating,
			DrawRating:     body.MatchRewards.DrawRating,
			LossRating:     body.MatchRewards.LossRating,
			RatingFloor:    body.MatchRewards.RatingFloor,
			StartingRating: body.MatchRewards.StartingRating,
		}
		if err := a.Settings.SetMatchRewards(r.Context(), cfg); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		changed["match_rewards"] = true
	}
	if body.WebAppOrigin != nil {
		if err := a.Settings.SetPlayRailWebAppOrigin(r.Context(), *body.WebAppOrigin); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		changed["web_app_origin"] = true
	}
	if a.Audit != nil && len(changed) > 0 {
		actor := auth.UserIDFromContext(r.Context())
		a.Audit.Log(r.Context(), &actor, "progression.put", "platform_settings", "progression", changed)
	}
	writeJSON(w, http.StatusOK, consolePlatformPayload(
		r.Context(), a.Settings,
	))
}

// progressionPayload builds public/console progression JSON.
// includeDisabledPresets=true for admin (full CRUD list); false for play (enabled only).
func progressionPayload(levels store.XPLevelsConfig, clock store.MatchClockConfig, rewards store.MatchRewardsConfig, includeDisabledPresets bool) map[string]any {
	outLevels := make([]map[string]any, 0, len(levels.Levels))
	for _, lvl := range levels.Levels {
		outLevels = append(outLevels, map[string]any{
			"min_xp": lvl.MinXP,
			"label":  lvl.Label,
		})
	}
	src := clock.Presets
	if !includeDisabledPresets {
		src = store.EnabledMatchClockPresets(clock.Presets)
	}
	presets := make([]map[string]any, 0, len(src))
	for _, p := range src {
		row := map[string]any{
			"seconds": p.Seconds,
			"label":   p.Label,
		}
		if includeDisabledPresets {
			row["enabled"] = p.Enabled
			row["sort_order"] = p.SortOrder
		}
		presets = append(presets, row)
	}
	return map[string]any{
		"xp_levels": outLevels,
		"match_clock": map[string]any{
			"enabled":                clock.Enabled,
			"initial_seconds":        clock.InitialSeconds,
			"increment_seconds":      clock.IncrementSeconds,
			"presets":                presets,
			"invite_ttl_seconds":     clock.InviteTTLSeconds,
			"pause_enabled":          clock.PauseEnabled,
			"pause_duration_seconds": clock.PauseDurationSeconds,
		},
		"match_rewards": map[string]any{
			"win_xp":          rewards.WinXP,
			"draw_xp":         rewards.DrawXP,
			"loss_xp":         rewards.LossXP,
			"win_rating":      rewards.WinRating,
			"draw_rating":     rewards.DrawRating,
			"loss_rating":     rewards.LossRating,
			"rating_floor":    rewards.RatingFloor,
			"starting_rating": rewards.StartingRating,
		},
	}
}

func consolePlatformPayload(ctx context.Context, settings *store.SettingsStore) map[string]any {
	out := progressionPayload(settings.XPLevels(), settings.MatchClock(), settings.MatchRewards(), true)
	ads := settings.AdPricing()
	ads.MarketplaceDefaults()
	out["ad_pricing"] = map[string]any{
		"impression_unit_cost":                  ads.ImpressionUnitCost,
		"campaign_create_fee_ethiopia_amount":   ads.CampaignCreateFeeEthiopiaAmount,
		"campaign_create_fee_ethiopia_currency": ads.CampaignCreateFeeEthiopiaCurrency,
		"campaign_create_fee_global_amount":     ads.CampaignCreateFeeGlobalAmount,
		"campaign_create_fee_global_currency":   ads.CampaignCreateFeeGlobalCurrency,
		"marketplace_enabled":                   ads.MarketplaceEnabled,
		"auction_enabled":                       ads.AuctionEnabled,
		"reservation_enabled":                   ads.ReservationEnabled,
		"default_buying_type":                   ads.DefaultBuyingType,
		"floor_cpm":                             ads.FloorCPM,
		"floor_cpm_ethiopia":                    ads.FloorCPMEthiopia,
		"floor_cpm_global":                      ads.FloorCPMGlobal,
		"placement_lobby_multiplier":            ads.PlacementLobbyMultiplier,
		"placement_in_match_multiplier":         ads.PlacementInMatchMultiplier,
		"viewport_desktop_multiplier":           ads.ViewportDesktopMultiplier,
		"viewport_tablet_multiplier":            ads.ViewportTabletMultiplier,
		"viewport_mobile_multiplier":            ads.ViewportMobileMultiplier,
		"peak_hour_multiplier":                  ads.PeakHourMultiplier,
		"peak_hours_utc_start":                  ads.PeakHoursUTCStart,
		"peak_hours_utc_end":                    ads.PeakHoursUTCEnd,
		"dynamic_floor_enabled":                 ads.DynamicFloorEnabled,
		"dynamic_floor_fill_pct":                ads.DynamicFloorFillPct,
		"dynamic_floor_boost":                   ads.DynamicFloorBoost,
		"agency_enabled":                        ads.AgencyEnabled,
		"agency_spend_percent":                  ads.AgencySpendPercent,
		"impression_wallet_settle_enabled":      ads.ImpressionWalletSettleEnabled,
		"audience_high_rating_min":              ads.AudienceHighRatingMin,
		"audience_high_rating_multiplier":       ads.AudienceHighRatingMultiplier,
		"tiers":                                 ads.Tiers,
	}
	if pkgs, err := settings.AdPackages(ctx); err == nil {
		out["ad_packages"] = store.SanitizePackageBuyingTypes(pkgs, ads.MarketplaceEnabled)
	} else {
		out["ad_packages"] = []store.AdPackage{}
	}
	origin, _ := settings.PlayRailWebAppOrigin(ctx)
	out["web_app_origin"] = origin // may be empty - admin must set for Flutter share
	return out
}
