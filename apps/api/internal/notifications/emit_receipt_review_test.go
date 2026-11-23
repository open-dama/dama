package notifications

import (
	"strings"
	"testing"
)

func TestSanitizePlayerFacingReason(t *testing.T) {
	t.Parallel()
	if got := SanitizePlayerFacingReason("  blurry photo  "); got != "blurry photo" {
		t.Fatalf("trim: got %q", got)
	}
	if got := SanitizePlayerFacingReason("line1\nline2\r\tline3"); got != "line1 line2 line3" {
		t.Fatalf("controls: got %q", got)
	}
	if got := SanitizePlayerFacingReason(""); got != "" {
		t.Fatalf("empty: got %q", got)
	}
	long := strings.Repeat("a", PlayerFacingReasonMaxRunes+40)
	if got := SanitizePlayerFacingReason(long); len([]rune(got)) != PlayerFacingReasonMaxRunes {
		t.Fatalf("cap: got %d runes want %d", len([]rune(got)), PlayerFacingReasonMaxRunes)
	}
}

func TestFormatBodyReceiptRejected(t *testing.T) {
	t.Parallel()
	const tpl = "Your payment proof was rejected. Reason: %s."
	got := formatBody(tpl, []string{"Blurry screenshot"})
	want := "Your payment proof was rejected. Reason: Blurry screenshot."
	if got != want {
		t.Fatalf("body=%q want %q", got, want)
	}
	// % in reason must not break Sprintf.
	got = formatBody(tpl, []string{"paid 50%"})
	want = "Your payment proof was rejected. Reason: paid 50%."
	if got != want {
		t.Fatalf("pct body=%q want %q", got, want)
	}
}

func TestKindPlayerReceiptRejectedConstant(t *testing.T) {
	t.Parallel()
	if KindPlayerReceiptRejected != "player.receipt_rejected" {
		t.Fatalf("kind=%q", KindPlayerReceiptRejected)
	}
	if KindPlayerReceiptReviewed == KindPlayerReceiptRejected {
		t.Fatal("reviewed and rejected kinds must differ")
	}
}

func TestSanitizePlayerFacingReasonControlOnly(t *testing.T) {
	t.Parallel()
	if got := SanitizePlayerFacingReason("\x00\x01\n\t\r"); got != "" {
		t.Fatalf("control-only: got %q", got)
	}
}
