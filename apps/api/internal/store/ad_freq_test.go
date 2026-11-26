package store

import (
	"testing"
	"time"
)

func TestViewerFreqBlocksRequiresViewer(t *testing.T) {
	s := &AdStore{}
	blocked, err := s.ViewerFreqBlocksCampaign(
		t.Context(),
		"",
		"",
		"00000000-0000-0000-0000-000000000001",
		"lobby",
		AdPlaybackConfig{FreqCapCampaignPerHour: 1, FreqCapMinGapSeconds: 30},
		time.Now().UTC(),
	)
	if err != nil {
		t.Fatal(err)
	}
	if blocked {
		t.Fatal("empty viewer must not block")
	}
}

func TestViewerFreqSessionCapsRequireSessionKey(t *testing.T) {
	s := &AdStore{}
	blocked, err := s.ViewerFreqBlocksCampaign(
		t.Context(),
		"viewer-a",
		"",
		"00000000-0000-0000-0000-000000000001",
		"lobby",
		AdPlaybackConfig{FreqCapCampaignPerSession: 1, FreqCapPlacementPerSession: 1},
		time.Now().UTC(),
	)
	if err != nil {
		t.Fatal(err)
	}
	if blocked {
		t.Fatal("empty session must skip session caps")
	}
}
