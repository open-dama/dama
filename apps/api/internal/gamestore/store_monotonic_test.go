package gamestore

import (
	"testing"

	"dama/apps/api/internal/game/engine"
)

func TestUpdateRejectsLowerMoveCountMemory(t *testing.T) {
	t.Setenv("DAMA_ALLOW_MEMORY", "1")
	s := New(nil)
	st0 := &engine.State{MoveCount: 0, Mode: "ai"}
	if _, err := s.Create("g1", st0); err != nil {
		t.Fatalf("create: %v", err)
	}
	st1 := &engine.State{MoveCount: 1, Mode: "ai"}
	if err := s.Update("g1", st1); err != nil {
		t.Fatalf("update tip: %v", err)
	}
	stStale := &engine.State{MoveCount: 0, Mode: "ai"}
	if err := s.Update("g1", stStale); err != ErrStaleUpdate {
		t.Fatalf("expected ErrStaleUpdate, got %v", err)
	}
	rec, ok := s.Get("g1")
	if !ok || rec.State == nil || rec.State.MoveCount != 1 {
		mc := -1
		if rec != nil && rec.State != nil {
			mc = rec.State.MoveCount
		}
		t.Fatalf("tip rewound: ok=%v mc=%d", ok, mc)
	}
}
