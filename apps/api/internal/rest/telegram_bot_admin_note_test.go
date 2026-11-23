package rest

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"dama/apps/api/internal/store"
)

func TestBotTelegramAdminNoteHumanSentence(t *testing.T) {
	t.Parallel()
	cfg := store.TelegramOpsBotConfig{
		ReviewNoteApprovedPrefix: "Approved via Telegram Bot by {telegram_id}",
		ReviewNoteRejectedPrefix: "Rejected via Telegram Bot by {telegram_id}",
		ReviewNoteTelegramIDTpl:  "by {telegram_id}",
		ReviewNoteReasonTemplate: "Reason: {reason}",
		ReviewNoteJoiner:         ". ",
	}
	req := httptest.NewRequest(http.MethodPost, "/x?admin_telegram_id=8173402934", nil)
	got := botTelegramAdminNote(req, cfg, cfg.ReviewNoteApprovedPrefix)
	want := "Approved via Telegram Bot by 8173402934"
	if got != want {
		t.Fatalf("approve note=%q want %q", got, want)
	}

	req = httptest.NewRequest(http.MethodPost, "/x?admin_telegram_id=1&reason=blurry", nil)
	got = botTelegramAdminNote(req, cfg, cfg.ReviewNoteRejectedPrefix)
	if got != "Rejected via Telegram Bot by 1. Reason: blurry" {
		t.Fatalf("reject note=%q", got)
	}

	// Redundant notes that also contain the telegram id must not duplicate.
	req = httptest.NewRequest(
		http.MethodPost,
		"/x?admin_telegram_id=9&notes=Approved+by+telegram+admin+9",
		nil,
	)
	got = botTelegramAdminNote(req, cfg, cfg.ReviewNoteApprovedPrefix)
	if got != "Approved via Telegram Bot by 9" {
		t.Fatalf("dedupe notes=%q", got)
	}
}
