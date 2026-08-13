package secureqr

import (
	"context"
	"crypto/sha256"
	"errors"
	"sync"
	"testing"
	"time"
)

type anchorCall struct {
	root  []byte
	count int
	at    time.Time
}

type mockAnchor struct {
	mu    sync.Mutex
	calls []anchorCall
}

func (m *mockAnchor) AnchorMerkleRoot(_ context.Context, root []byte, eventCount int, anchoredAt time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	copyRoot := append([]byte(nil), root...)
	m.calls = append(m.calls, anchorCall{root: copyRoot, count: eventCount, at: anchoredAt})
	return nil
}

func (m *mockAnchor) callCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.calls)
}

func TestECDSASignAndVerify(t *testing.T) {
	priv, err := GenerateECDSAKey()
	if err != nil {
		t.Fatalf("GenerateECDSAKey: %v", err)
	}
	payload := []byte("org-credential:employee:123")
	sig, err := SignCredential(priv, payload)
	if err != nil {
		t.Fatalf("SignCredential: %v", err)
	}
	if !VerifyCredential(&priv.PublicKey, payload, sig) {
		t.Fatal("expected signature verification to succeed")
	}
	if VerifyCredential(&priv.PublicKey, []byte("tampered"), sig) {
		t.Fatal("expected tampered payload verification to fail")
	}
}

func TestEphemeralTokenAntiReplayAndExpiry(t *testing.T) {
	m := NewTokenManager(5 * time.Second)
	now := time.Now().UTC()
	m.now = func() time.Time { return now }

	token, err := m.Issue()
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	if err := m.ValidateAndConsume(token); err != nil {
		t.Fatalf("first consume should pass: %v", err)
	}
	if err := m.ValidateAndConsume(token); !errors.Is(err, ErrReplayedToken) {
		t.Fatalf("expected replay error, got %v", err)
	}

	expired, err := m.Issue()
	if err != nil {
		t.Fatalf("Issue expired token: %v", err)
	}
	now = now.Add(10 * time.Second)
	if err := m.ValidateAndConsume(expired); !errors.Is(err, ErrExpiredToken) {
		t.Fatalf("expected expired token error, got %v", err)
	}
}

func TestHashChainedLogAndMerkleRoot(t *testing.T) {
	var l HashChainedLog
	at := time.Now().UTC()
	e1 := l.Append([]byte("event-1"), "token-1", at)
	e2 := l.Append([]byte("event-2"), "token-2", at.Add(time.Second))

	if e2.PrevHash != e1.Hash {
		t.Fatal("expected second event to chain to first hash")
	}
	if !l.VerifyChain() {
		t.Fatal("expected hash chain verification to pass")
	}

	leaves := l.PendingHashes()
	root := MerkleRoot(leaves)
	if len(root) != sha256.Size {
		t.Fatalf("expected root length %d, got %d", sha256.Size, len(root))
	}
	if got2 := MerkleRoot(leaves); string(root) != string(got2) {
		t.Fatal("expected deterministic merkle root")
	}
}

func TestValidationAndAnchoringFlow(t *testing.T) {
	priv, err := GenerateECDSAKey()
	if err != nil {
		t.Fatalf("GenerateECDSAKey: %v", err)
	}
	anchor := &mockAnchor{}
	m := NewValidationModel(time.Minute, anchor)

	token1, _ := m.Tokens.Issue()
	token2, _ := m.Tokens.Issue()
	payload1 := []byte("credential-a")
	payload2 := []byte("credential-b")
	sig1, _ := SignCredential(priv, payload1)
	sig2, _ := SignCredential(priv, payload2)

	if err := m.ValidateCredential(&priv.PublicKey, payload1, sig1, token1); err != nil {
		t.Fatalf("validate 1: %v", err)
	}
	if err := m.ValidateCredential(&priv.PublicKey, payload2, sig2, token2); err != nil {
		t.Fatalf("validate 2: %v", err)
	}
	anchored, err := m.AnchorPending(context.Background())
	if err != nil {
		t.Fatalf("AnchorPending: %v", err)
	}
	if !anchored {
		t.Fatal("expected anchoring to happen")
	}
	if anchor.callCount() != 1 {
		t.Fatalf("expected 1 anchor call, got %d", anchor.callCount())
	}
}

func TestStartPeriodicAnchoring(t *testing.T) {
	priv, err := GenerateECDSAKey()
	if err != nil {
		t.Fatalf("GenerateECDSAKey: %v", err)
	}
	anchor := &mockAnchor{}
	m := NewValidationModel(time.Minute, anchor)
	token, _ := m.Tokens.Issue()
	payload := []byte("credential-periodic")
	sig, _ := SignCredential(priv, payload)
	if err := m.ValidateCredential(&priv.PublicKey, payload, sig, token); err != nil {
		t.Fatalf("ValidateCredential: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- m.StartPeriodicAnchoring(ctx, 10*time.Millisecond)
	}()

	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if anchor.callCount() > 0 {
			cancel()
			err := <-done
			if !errors.Is(err, context.Canceled) {
				t.Fatalf("expected context cancellation, got %v", err)
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	cancel()
	<-done
	t.Fatal("expected periodic anchoring call")
}
