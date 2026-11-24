package rest

import (
	"net/http"
	"strings"

	"dama/apps/api/internal/geo"
	"dama/apps/api/internal/store"
)

// privateDefaultFromSettings builds geo.PrivateDefault from platform_settings.geo_payment.
func privateDefaultFromSettings(settings *store.SettingsStore) geo.PrivateDefault {
	if settings == nil {
		return geo.PrivateDefault{}
	}
	return geo.PrivateDefault{
		CountryCode: settings.EthiopiaCountry(),
		City:        settings.PrivateDefaultCity(),
		Region:      settings.PrivateDefaultRegion(),
	}
}

// applyPreferDeviceGpsCoords zeros lat/lng when Prefer device GPS is OFF (IP-only mode).
// Default ON when flags unavailable (protect jurisdiction).
func applyPreferDeviceGpsCoords(r *http.Request, flags *store.FlagStore, lat, lng float64) (float64, float64) {
	if flags == nil || r == nil {
		return lat, lng
	}
	if !flags.Get(r.Context()).GeoPreferDeviceGps {
		return 0, 0
	}
	return lat, lng
}

// resolvePayerCountryFromRequest resolves pay-chain country from request IP/GPS only
// (reference pay geo: no client country_code, no profile fallback).
// When Prefer device GPS is OFF, lat/lng are ignored (IP / private invent only).
func resolvePayerCountryFromRequest(
	r *http.Request,
	locate *geo.Resolver,
	settings *store.SettingsStore,
	flags *store.FlagStore,
	lat, lng float64,
) string {
	if r == nil || locate == nil {
		return ""
	}
	lat, lng = applyPreferDeviceGpsCoords(r, flags, lat, lng)
	res, err := locate.Resolve(
		r.Context(),
		"",
		false,
		lat,
		lng,
		geo.ClientIP(r),
		privateDefaultFromSettings(settings),
	)
	if err != nil || res == nil {
		return ""
	}
	cc := strings.ToUpper(strings.TrimSpace(res.CountryCode))
	if len(cc) != 2 {
		return ""
	}
	return cc
}
