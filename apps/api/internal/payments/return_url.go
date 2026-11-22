package payments

import (
	"net/url"
	"strings"
)

// SanitizeCheckoutReturnURL allows only http(s) absolute URLs whose host matches
// an approved origin (open-redirect safe). Empty / invalid → "".
func SanitizeCheckoutReturnURL(raw string, approvedOrigins []string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return ""
	}
	for _, origin := range approvedOrigins {
		origin = strings.TrimSpace(origin)
		if origin == "" {
			continue
		}
		o, err := url.Parse(origin)
		if err != nil || o.Host == "" {
			continue
		}
		if strings.EqualFold(o.Hostname(), host) {
			return u.String()
		}
	}
	return ""
}

// DefaultWalletReturnURL builds {webBase}/wallet?checkout=success when webBase is set.
func DefaultWalletReturnURL(webBase string) string {
	base := strings.TrimRight(strings.TrimSpace(webBase), "/")
	if base == "" {
		return ""
	}
	u, err := url.Parse(base + "/wallet")
	if err != nil {
		return ""
	}
	q := u.Query()
	q.Set("checkout", "success")
	u.RawQuery = q.Encode()
	return u.String()
}

// ResolveCheckoutReturnURL prefers a sanitized client return URL, else default wallet.
func ResolveCheckoutReturnURL(clientReturn, webBase string, approvedOrigins []string) string {
	origins := append([]string{}, approvedOrigins...)
	if wb := strings.TrimRight(strings.TrimSpace(webBase), "/"); wb != "" {
		origins = append(origins, wb)
	}
	if s := SanitizeCheckoutReturnURL(clientReturn, origins); s != "" {
		return s
	}
	return DefaultWalletReturnURL(webBase)
}

// PaddlePayCheckoutURL is the approved-domain pay bridge page. Paddle appends ?_ptxn=.
// When returnURL is set, it is included so Paddle.js can set successUrl on load.
func PaddlePayCheckoutURL(webBase, returnURL string) string {
	base := strings.TrimRight(strings.TrimSpace(webBase), "/")
	if base == "" {
		return ""
	}
	u, err := url.Parse(base + "/pay")
	if err != nil {
		return ""
	}
	if ret := strings.TrimSpace(returnURL); ret != "" {
		q := u.Query()
		q.Set("return_url", ret)
		u.RawQuery = q.Encode()
	}
	return u.String()
}
