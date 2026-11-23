package notifications

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Live DB: insert player.receipt_rejected and assert list body includes reason.
// Skips when DAMA_DATABASE_URL is unset.
func TestLiveReceiptRejectedNotifBody(t *testing.T) {
	url := strings.TrimSpace(os.Getenv("DAMA_DATABASE_URL"))
	if url == "" {
		url = strings.TrimSpace(os.Getenv("DATABASE_URL"))
	}
	if url == "" {
		t.Skip("no DAMA_DATABASE_URL")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	var kindN int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM notification_kinds WHERE code=$1`, KindPlayerReceiptRejected).Scan(&kindN); err != nil || kindN != 1 {
		t.Fatalf("kind missing: n=%d err=%v", kindN, err)
	}

	var userID string
	if err := pool.QueryRow(ctx, `SELECT id::text FROM users WHERE is_active=TRUE ORDER BY created_at DESC NULLS LAST LIMIT 1`).Scan(&userID); err != nil || strings.TrimSpace(userID) == "" {
		t.Skip("no active user for live notif insert")
	}

	receiptID := "00000000-0000-4000-8000-000000000543"
	reason := "E2E blurry proof"
	dedupe := "e2e_receipt_rejected_live:" + receiptID + ":" + userID

	_, _ = pool.Exec(ctx, `DELETE FROM app_notifications WHERE recipient_id=$1::uuid AND dedupe_key=$2`, userID, dedupe)

	if err := Insert(ctx, pool, InsertOpts{
		RecipientID:  userID,
		Audience:     AudiencePlayer,
		KindCode:     KindPlayerReceiptRejected,
		BodyArgs:     []string{SanitizePlayerFacingReason(reason)},
		DedupeKey:    dedupe,
		HrefEntityID: receiptID,
	}); err != nil {
		t.Fatalf("insert: %v", err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM app_notifications WHERE recipient_id=$1::uuid AND dedupe_key=$2`, userID, dedupe)
	})

	var title, bodyTpl string
	var argsRaw []byte
	var entityID string
	if err := pool.QueryRow(ctx, `
		SELECT k.title_template, k.body_template, n.body_args, COALESCE(n.href_entity_id,'')
		FROM app_notifications n
		JOIN notification_kinds k ON k.code = n.kind_code
		WHERE n.recipient_id=$1::uuid AND n.dedupe_key=$2
	`, userID, dedupe).Scan(&title, &bodyTpl, &argsRaw, &entityID); err != nil {
		t.Fatalf("select: %v", err)
	}
	if strings.TrimSpace(title) == "" {
		t.Fatal("empty title")
	}
	var args []string
	if err := json.Unmarshal(argsRaw, &args); err != nil || len(args) != 1 {
		t.Fatalf("args=%v err=%v", args, err)
	}
	body := formatBody(bodyTpl, args)
	want := "Your payment proof was rejected. Reason: E2E blurry proof."
	if body != want {
		t.Fatalf("body=%q want %q", body, want)
	}
	href := resolveHref("/receipts", "id", entityID)
	if href != "/receipts?id="+receiptID {
		t.Fatalf("href=%q", href)
	}
	t.Logf("LIVE_OK title=%q body=%q href=%q", title, body, href)
}
