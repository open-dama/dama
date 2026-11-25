package store

import (
	"encoding/json"
	"testing"
)

func TestParseMatchClockPresetsJSONLegacyDefaultsEnabled(t *testing.T) {
	raw := json.RawMessage(`[{"seconds":60,"label":"1 min"},{"seconds":180,"label":"3 min","enabled":false,"sort_order":9}]`)
	got, err := parseMatchClockPresetsJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("len=%d", len(got))
	}
	if !got[0].Enabled || got[0].SortOrder != 0 {
		t.Fatalf("legacy row: %+v", got[0])
	}
	if got[1].Enabled || got[1].SortOrder != 9 {
		t.Fatalf("explicit row: %+v", got[1])
	}
}

func TestNormalizeAndValidateMatchClockPresets(t *testing.T) {
	_, err := normalizeAndValidateMatchClockPresets([]MatchClockPreset{
		{Seconds: 60, Label: "1", Enabled: false},
		{Seconds: 180, Label: "3", Enabled: false},
	}, 60)
	if err == nil {
		t.Fatal("expected error when no enabled presets")
	}
	_, err = normalizeAndValidateMatchClockPresets([]MatchClockPreset{
		{Seconds: 60, Label: "1", Enabled: true},
		{Seconds: 180, Label: "3", Enabled: true},
	}, 600)
	if err == nil {
		t.Fatal("expected error when initial not in enabled presets")
	}
	out, err := normalizeAndValidateMatchClockPresets([]MatchClockPreset{
		{Seconds: 180, Label: "3", Enabled: true, SortOrder: 1},
		{Seconds: 60, Label: "1", Enabled: false, SortOrder: 0},
		{Seconds: 600, Label: "10", Enabled: true, SortOrder: 2},
	}, 180)
	if err != nil {
		t.Fatal(err)
	}
	if len(out) != 3 || out[0].Seconds != 60 || out[1].Seconds != 180 {
		t.Fatalf("sort failed: %+v", out)
	}
	enabled := EnabledMatchClockPresets(out)
	if len(enabled) != 2 || enabled[0].Seconds != 180 {
		t.Fatalf("enabled filter: %+v", enabled)
	}
}
