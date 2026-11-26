package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// CountViewerCampaignImpressionsSince counts shows of one campaign for a viewer since t.
func (s *AdStore) CountViewerCampaignImpressionsSince(ctx context.Context, viewerKey, campaignID string, since time.Time) (int64, error) {
	viewerKey = strings.TrimSpace(viewerKey)
	campaignID = strings.TrimSpace(campaignID)
	if viewerKey == "" || campaignID == "" {
		return 0, nil
	}
	if s.db == nil || !s.db.Ready() {
		return 0, fmt.Errorf("service temporarily unavailable")
	}
	var n int64
	err := s.db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM ad_impression_events
		WHERE viewer_key = $1 AND campaign_id = $2::uuid AND created_at >= $3
	`, viewerKey, campaignID, since.UTC()).Scan(&n)
	return n, err
}

// CountViewerPlacementImpressionsSince counts shows on one placement for a viewer since t.
func (s *AdStore) CountViewerPlacementImpressionsSince(ctx context.Context, viewerKey, placement string, since time.Time) (int64, error) {
	viewerKey = strings.TrimSpace(viewerKey)
	placement = strings.TrimSpace(placement)
	if viewerKey == "" || placement == "" {
		return 0, nil
	}
	if s.db == nil || !s.db.Ready() {
		return 0, fmt.Errorf("service temporarily unavailable")
	}
	var n int64
	err := s.db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM ad_impression_events
		WHERE viewer_key = $1 AND placement = $2 AND created_at >= $3
	`, viewerKey, placement, since.UTC()).Scan(&n)
	return n, err
}

// CountSessionCampaignImpressions counts shows of one campaign in a browser/app session.
func (s *AdStore) CountSessionCampaignImpressions(ctx context.Context, sessionKey, campaignID string) (int64, error) {
	sessionKey = strings.TrimSpace(sessionKey)
	campaignID = strings.TrimSpace(campaignID)
	if sessionKey == "" || campaignID == "" {
		return 0, nil
	}
	if s.db == nil || !s.db.Ready() {
		return 0, fmt.Errorf("service temporarily unavailable")
	}
	var n int64
	err := s.db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM ad_impression_events
		WHERE session_key = $1 AND campaign_id = $2::uuid
	`, sessionKey, campaignID).Scan(&n)
	return n, err
}

// CountSessionPlacementImpressions counts shows on one placement in a browser/app session.
func (s *AdStore) CountSessionPlacementImpressions(ctx context.Context, sessionKey, placement string) (int64, error) {
	sessionKey = strings.TrimSpace(sessionKey)
	placement = strings.TrimSpace(placement)
	if sessionKey == "" || placement == "" {
		return 0, nil
	}
	if s.db == nil || !s.db.Ready() {
		return 0, fmt.Errorf("service temporarily unavailable")
	}
	var n int64
	err := s.db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM ad_impression_events
		WHERE session_key = $1 AND placement = $2
	`, sessionKey, placement).Scan(&n)
	return n, err
}

// SecondsSinceLastViewerImpression returns seconds since any show for this viewer.
// ok=false when the viewer has no events yet.
func (s *AdStore) SecondsSinceLastViewerImpression(ctx context.Context, viewerKey string, now time.Time) (seconds int, ok bool, err error) {
	viewerKey = strings.TrimSpace(viewerKey)
	if viewerKey == "" {
		return 0, false, nil
	}
	if s.db == nil || !s.db.Ready() {
		return 0, false, fmt.Errorf("service temporarily unavailable")
	}
	var last time.Time
	err = s.db.Pool.QueryRow(ctx, `
		SELECT created_at
		FROM ad_impression_events
		WHERE viewer_key = $1
		ORDER BY created_at DESC
		LIMIT 1
	`, viewerKey).Scan(&last)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, false, nil
		}
		return 0, false, err
	}
	if last.IsZero() {
		return 0, false, nil
	}
	sec := int(now.UTC().Sub(last.UTC()).Seconds())
	if sec < 0 {
		sec = 0
	}
	return sec, true, nil
}

// ViewerFreqBlocksCampaign reports whether frequency policy blocks this campaign+placement
// for the viewer/session. Empty viewerKey skips checks (backward compatible). Cap 0 disables that rule.
func (s *AdStore) ViewerFreqBlocksCampaign(ctx context.Context, viewerKey, sessionKey, campaignID, placement string, pb AdPlaybackConfig, now time.Time) (bool, error) {
	viewerKey = strings.TrimSpace(viewerKey)
	sessionKey = strings.TrimSpace(sessionKey)
	campaignID = strings.TrimSpace(campaignID)
	placement = strings.TrimSpace(placement)
	if campaignID == "" || placement == "" {
		return false, nil
	}
	if viewerKey != "" && pb.FreqCapMinGapSeconds > 0 {
		sec, ok, err := s.SecondsSinceLastViewerImpression(ctx, viewerKey, now)
		if err != nil {
			return false, err
		}
		if ok && sec < pb.FreqCapMinGapSeconds {
			return true, nil
		}
	}
	if viewerKey != "" && pb.FreqCapCampaignPerHour > 0 {
		n, err := s.CountViewerCampaignImpressionsSince(ctx, viewerKey, campaignID, now.Add(-1*time.Hour))
		if err != nil {
			return false, err
		}
		if n >= int64(pb.FreqCapCampaignPerHour) {
			return true, nil
		}
	}
	if viewerKey != "" && pb.FreqCapCampaignPerDay > 0 {
		n, err := s.CountViewerCampaignImpressionsSince(ctx, viewerKey, campaignID, now.Add(-24*time.Hour))
		if err != nil {
			return false, err
		}
		if n >= int64(pb.FreqCapCampaignPerDay) {
			return true, nil
		}
	}
	if viewerKey != "" && pb.FreqCapPlacementPerHour > 0 {
		n, err := s.CountViewerPlacementImpressionsSince(ctx, viewerKey, placement, now.Add(-1*time.Hour))
		if err != nil {
			return false, err
		}
		if n >= int64(pb.FreqCapPlacementPerHour) {
			return true, nil
		}
	}
	if viewerKey != "" && pb.FreqCapPlacementPerDay > 0 {
		n, err := s.CountViewerPlacementImpressionsSince(ctx, viewerKey, placement, now.Add(-24*time.Hour))
		if err != nil {
			return false, err
		}
		if n >= int64(pb.FreqCapPlacementPerDay) {
			return true, nil
		}
	}
	if sessionKey != "" && pb.FreqCapCampaignPerSession > 0 {
		n, err := s.CountSessionCampaignImpressions(ctx, sessionKey, campaignID)
		if err != nil {
			return false, err
		}
		if n >= int64(pb.FreqCapCampaignPerSession) {
			return true, nil
		}
	}
	if sessionKey != "" && pb.FreqCapPlacementPerSession > 0 {
		n, err := s.CountSessionPlacementImpressions(ctx, sessionKey, placement)
		if err != nil {
			return false, err
		}
		if n >= int64(pb.FreqCapPlacementPerSession) {
			return true, nil
		}
	}
	return false, nil
}
