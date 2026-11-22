package payments

import (
	"strings"
	"testing"
)

func TestSanitizeCheckoutReturnURL(t *testing.T) {
	origins := []string{"https://www.opendama.com", "https://opendama.com"}
	got := SanitizeCheckoutReturnURL("https://www.opendama.com/wallet?checkout=success", origins)
	if got == "" {
		t.Fatal("expected approved return URL")
	}
	if SanitizeCheckoutReturnURL("https://evil.example/phish", origins) != "" {
		t.Fatal("expected open redirect blocked")
	}
	if SanitizeCheckoutReturnURL("javascript:alert(1)", origins) != "" {
		t.Fatal("expected non-http blocked")
	}
}

func TestPaddlePayCheckoutURL(t *testing.T) {
	u := PaddlePayCheckoutURL("https://www.opendama.com", "https://www.opendama.com/wallet?checkout=success")
	if !strings.Contains(u, "/pay") || !strings.Contains(u, "return_url=") {
		t.Fatalf("unexpected pay url: %s", u)
	}
}

func TestDefaultWalletReturnURL(t *testing.T) {
	got := DefaultWalletReturnURL("https://www.opendama.com/")
	if !strings.Contains(got, "/wallet") || !strings.Contains(got, "checkout=success") {
		t.Fatalf("unexpected default: %s", got)
	}
}
