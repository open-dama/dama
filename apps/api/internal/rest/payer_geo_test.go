package rest

import (
	"context"
	"net/http"
	"testing"
)

func TestApplyPreferDeviceGpsCoordsNilFlagsKeepsCoords(t *testing.T) {
	r, _ := http.NewRequestWithContext(context.Background(), http.MethodPost, "/geo/locate", nil)
	lat, lng := applyPreferDeviceGpsCoords(r, nil, 40.7, -74)
	if lat != 40.7 || lng != -74 {
		t.Fatalf("nil flags should keep coords, got %v,%v", lat, lng)
	}
}
