package secureqr

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"sync"
	"time"
)

var (
	ErrInvalidSignature = errors.New("invalid ECDSA signature")
	ErrUnknownToken     = errors.New("unknown token")
	ErrExpiredToken     = errors.New("expired token")
	ErrReplayedToken    = errors.New("replayed token")
)

func GenerateECDSAKey() (*ecdsa.PrivateKey, error) {
	return ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
}

func SignCredential(priv *ecdsa.PrivateKey, payload []byte) ([]byte, error) {
	digest := sha256.Sum256(payload)
	return ecdsa.SignASN1(rand.Reader, priv, digest[:])
}

func VerifyCredential(pub *ecdsa.PublicKey, payload, signature []byte) bool {
	digest := sha256.Sum256(payload)
	return ecdsa.VerifyASN1(pub, digest[:], signature)
}

type tokenState struct {
	expiresAt time.Time
	used      bool
}

type TokenManager struct {
	mu     sync.Mutex
	ttl    time.Duration
	now    func() time.Time
	tokens map[string]tokenState
}

func NewTokenManager(ttl time.Duration) *TokenManager {
	return &TokenManager{
		ttl:    ttl,
		now:    time.Now,
		tokens: make(map[string]tokenState),
	}
}

func (m *TokenManager) Issue() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(buf)

	m.mu.Lock()
	defer m.mu.Unlock()
	m.tokens[token] = tokenState{expiresAt: m.now().Add(m.ttl)}
	return token, nil
}

func (m *TokenManager) ValidateAndConsume(token string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	state, ok := m.tokens[token]
	if !ok {
		return ErrUnknownToken
	}
	if m.now().After(state.expiresAt) {
		delete(m.tokens, token)
		return ErrExpiredToken
	}
	if state.used {
		return ErrReplayedToken
	}
	state.used = true
	m.tokens[token] = state
	return nil
}

type Event struct {
	Timestamp time.Time
	Payload   []byte
	Token     string
	PrevHash  [32]byte
	Hash      [32]byte
}

type HashChainedLog struct {
	mu      sync.Mutex
	events  []Event
	pending [][32]byte
}

func (l *HashChainedLog) Append(payload []byte, token string, at time.Time) Event {
	l.mu.Lock()
	defer l.mu.Unlock()

	var prev [32]byte
	if n := len(l.events); n > 0 {
		prev = l.events[n-1].Hash
	}

	h := sha256.New()
	h.Write(prev[:])
	h.Write([]byte(at.UTC().Format(time.RFC3339Nano)))
	h.Write(payload)
	h.Write([]byte(token))
	hashBytes := h.Sum(nil)

	var cur [32]byte
	copy(cur[:], hashBytes)
	event := Event{Timestamp: at.UTC(), Payload: append([]byte(nil), payload...), Token: token, PrevHash: prev, Hash: cur}
	l.events = append(l.events, event)
	l.pending = append(l.pending, cur)
	return event
}

func (l *HashChainedLog) VerifyChain() bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	for i := range l.events {
		var prev [32]byte
		if i > 0 {
			prev = l.events[i-1].Hash
		}
		e := l.events[i]
		if e.PrevHash != prev {
			return false
		}
		h := sha256.New()
		h.Write(prev[:])
		h.Write([]byte(e.Timestamp.UTC().Format(time.RFC3339Nano)))
		h.Write(e.Payload)
		h.Write([]byte(e.Token))
		if sum := h.Sum(nil); string(sum) != string(e.Hash[:]) {
			return false
		}
	}
	return true
}

func (l *HashChainedLog) PendingHashes() [][]byte {
	l.mu.Lock()
	defer l.mu.Unlock()

	out := make([][]byte, 0, len(l.pending))
	for _, h := range l.pending {
		copyHash := make([]byte, 32)
		copy(copyHash, h[:])
		out = append(out, copyHash)
	}
	return out
}

func (l *HashChainedLog) ConsumePendingCount() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	count := len(l.pending)
	l.pending = nil
	return count
}

func MerkleRoot(leaves [][]byte) []byte {
	if len(leaves) == 0 {
		return nil
	}
	level := make([][]byte, len(leaves))
	for i := range leaves {
		d := sha256.Sum256(leaves[i])
		level[i] = d[:]
	}

	for len(level) > 1 {
		next := make([][]byte, 0, (len(level)+1)/2)
		for i := 0; i < len(level); i += 2 {
			left := level[i]
			right := left
			if i+1 < len(level) {
				right = level[i+1]
			}
			h := sha256.New()
			h.Write(left)
			h.Write(right)
			next = append(next, h.Sum(nil))
		}
		level = next
	}

	root := make([]byte, len(level[0]))
	copy(root, level[0])
	return root
}

type PermissionedBlockchainAnchor interface {
	AnchorMerkleRoot(ctx context.Context, root []byte, eventCount int, anchoredAt time.Time) error
}

type ValidationModel struct {
	Tokens   *TokenManager
	Log      *HashChainedLog
	Anchorer PermissionedBlockchainAnchor
	Now      func() time.Time
}

func NewValidationModel(tokenTTL time.Duration, anchorer PermissionedBlockchainAnchor) *ValidationModel {
	return &ValidationModel{
		Tokens:   NewTokenManager(tokenTTL),
		Log:      &HashChainedLog{},
		Anchorer: anchorer,
		Now:      time.Now,
	}
}

func (m *ValidationModel) ValidateCredential(pub *ecdsa.PublicKey, payload, signature []byte, token string) error {
	if !VerifyCredential(pub, payload, signature) {
		return ErrInvalidSignature
	}
	if err := m.Tokens.ValidateAndConsume(token); err != nil {
		return err
	}
	m.Log.Append(payload, token, m.Now())
	return nil
}

func (m *ValidationModel) AnchorPending(ctx context.Context) (bool, error) {
	leaves := m.Log.PendingHashes()
	if len(leaves) == 0 {
		return false, nil
	}
	if m.Anchorer == nil {
		return false, errors.New("missing permissioned blockchain anchor")
	}
	root := MerkleRoot(leaves)
	count := m.Log.ConsumePendingCount()
	if err := m.Anchorer.AnchorMerkleRoot(ctx, root, count, m.Now().UTC()); err != nil {
		return false, err
	}
	return true, nil
}

func (m *ValidationModel) StartPeriodicAnchoring(ctx context.Context, interval time.Duration) error {
	if interval <= 0 {
		return fmt.Errorf("interval must be > 0")
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			_, _ = m.AnchorPending(ctx)
		}
	}
}
