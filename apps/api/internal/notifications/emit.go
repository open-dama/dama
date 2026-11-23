package notifications

import (
	"context"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgxpool"
)

// PlayerFacingReasonMaxRunes caps reject-reason body args (SMS/push-safe length).
const PlayerFacingReasonMaxRunes = 280

// EmitPlayer inserts a player-audience notification (errors ignored by callers via _).
func EmitPlayer(ctx context.Context, db *pgxpool.Pool, recipientID, kindCode, dedupeKey, hrefEntityID string, bodyArgs ...string) {
	if db == nil || strings.TrimSpace(recipientID) == "" || strings.TrimSpace(kindCode) == "" {
		return
	}
	_ = Insert(ctx, db, InsertOpts{
		RecipientID:  recipientID,
		Audience:     AudiencePlayer,
		KindCode:     kindCode,
		BodyArgs:     bodyArgs,
		DedupeKey:    dedupeKey,
		HrefEntityID: hrefEntityID,
	})
}

// EmitAdmins notifies all active console-role users.
func EmitAdmins(ctx context.Context, db *pgxpool.Pool, consoleRoles []string, kindCode, dedupeKeyPrefix, hrefEntityID string, bodyArgs ...string) {
	if db == nil || strings.TrimSpace(kindCode) == "" || len(consoleRoles) == 0 {
		return
	}
	_ = InsertForConsoleRoles(ctx, db, consoleRoles, kindCode, bodyArgs, dedupeKeyPrefix, "", hrefEntityID)
}

// EmitActivePlayers notifies every active user with the given player role.
func EmitActivePlayers(ctx context.Context, db *pgxpool.Pool, playerRole, kindCode, dedupeKeyPrefix, hrefEntityID string, bodyArgs ...string) {
	if db == nil || strings.TrimSpace(kindCode) == "" {
		return
	}
	playerRole = strings.TrimSpace(playerRole)
	if playerRole == "" {
		playerRole = AudiencePlayer
	}
	rows, err := db.Query(ctx, `
		SELECT id::text FROM users
		WHERE is_active = TRUE AND role = $1
	`, playerRole)
	if err != nil {
		return
	}
	defer rows.Close()
	prefix := strings.TrimSpace(dedupeKeyPrefix)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		dedupe := ""
		if prefix != "" {
			dedupe = prefix + ":" + id
		}
		EmitPlayer(ctx, db, id, kindCode, dedupe, hrefEntityID, bodyArgs...)
	}
}

// NotifyTournamentLifecycle emits DB-backed player notifications for create/open
// and status changes. Broadcasts player.tournament_created to all active players
// when status becomes enrollable; notifies entrants with player.tournament_status
// on any real status transition.
func NotifyTournamentLifecycle(
	ctx context.Context,
	db *pgxpool.Pool,
	playerRole string,
	enrollableStatus string,
	tournamentID, title, newStatus, previousStatus string,
	entrantUserIDs []string,
) {
	if db == nil {
		return
	}
	tournamentID = strings.TrimSpace(tournamentID)
	newStatus = strings.TrimSpace(newStatus)
	previousStatus = strings.TrimSpace(previousStatus)
	title = strings.TrimSpace(title)
	enrollableStatus = strings.TrimSpace(enrollableStatus)
	if tournamentID == "" || newStatus == "" {
		return
	}
	if previousStatus == newStatus {
		return
	}
	if title == "" {
		title = "Tournament"
	}

	if enrollableStatus != "" && newStatus == enrollableStatus && previousStatus != enrollableStatus {
		EmitActivePlayers(ctx, db, playerRole, KindPlayerTournamentCreated,
			"tournament_created:"+tournamentID, tournamentID, title)
	}

	for _, uid := range entrantUserIDs {
		uid = strings.TrimSpace(uid)
		if uid == "" {
			continue
		}
		EmitPlayer(ctx, db, uid, KindPlayerTournamentStatus,
			"tournament_status:"+tournamentID+":"+newStatus+":"+uid, tournamentID, title, newStatus)
	}
}

// MoneyArgs formats amount + currency for body templates.
func MoneyArgs(amount float64, currency string) []string {
	return []string{fmt.Sprintf("%.2f", amount), strings.TrimSpace(currency)}
}

// SanitizePlayerFacingReason trims, drops control characters, collapses
// whitespace, and caps length for notification body args. Empty input yields
// empty (caller fails closed).
func SanitizePlayerFacingReason(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(s))
	n := 0
	spacePending := false
	for _, r := range s {
		if r == '\n' || r == '\r' || r == '\t' || r == ' ' {
			if n > 0 {
				spacePending = true
			}
			continue
		}
		if unicode.IsControl(r) {
			continue
		}
		if n >= PlayerFacingReasonMaxRunes {
			break
		}
		if spacePending {
			b.WriteByte(' ')
			spacePending = false
		}
		b.WriteRune(r)
		n++
	}
	out := strings.TrimSpace(b.String())
	if utf8.RuneCountInString(out) > PlayerFacingReasonMaxRunes {
		runes := []rune(out)
		out = string(runes[:PlayerFacingReasonMaxRunes])
		out = strings.TrimSpace(out)
	}
	return out
}

// EmitReceiptReview notifies the player after a manual receipt review.
// Approve → player.receipt_reviewed with display status label.
// Reject → player.receipt_rejected with sanitized reason only (callers must
// fail closed before review when reason is empty; no status-only fallback).
func EmitReceiptReview(ctx context.Context, db *pgxpool.Pool, recipientID, receiptID, statusLabel string, approve bool, playerFacingReason string) {
	if db == nil || strings.TrimSpace(recipientID) == "" || strings.TrimSpace(receiptID) == "" {
		return
	}
	if approve {
		if label := strings.TrimSpace(statusLabel); label != "" {
			EmitPlayer(ctx, db, recipientID, KindPlayerReceiptReviewed,
				"receipt_reviewed:"+receiptID, receiptID, label)
		}
		return
	}
	reason := SanitizePlayerFacingReason(playerFacingReason)
	if reason == "" {
		return
	}
	EmitPlayer(ctx, db, recipientID, KindPlayerReceiptRejected,
		"receipt_rejected:"+receiptID, receiptID, reason)
}
