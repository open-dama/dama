package rest

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseEntryRosterFilter(t *testing.T) {
	t.Parallel()
	req := httptest.NewRequest(http.MethodGet, "/x?status=approved&checked_in=1&placed=1", nil)
	f, ok := parseEntryRosterFilter(req)
	if !ok {
		t.Fatal("expected ok")
	}
	if f.Status != "approved" || f.CheckedIn == nil || !*f.CheckedIn || !f.PlacedOnly {
		t.Fatalf("unexpected filter: %+v checked=%v", f, f.CheckedIn)
	}

	req2 := httptest.NewRequest(http.MethodGet, "/x?checked_in=0", nil)
	f2, ok2 := parseEntryRosterFilter(req2)
	if !ok2 || f2.CheckedIn == nil || *f2.CheckedIn {
		t.Fatalf("expected checked_in=false, ok=%v f=%+v", ok2, f2)
	}

	req3 := httptest.NewRequest(http.MethodGet, "/x?checked_in=maybe", nil)
	if _, ok3 := parseEntryRosterFilter(req3); ok3 {
		t.Fatal("expected invalid checked_in to fail")
	}
}
