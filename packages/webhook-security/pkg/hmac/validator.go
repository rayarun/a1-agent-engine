package hmac

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"time"
)

var (
	ErrMissingSignature = errors.New("missing X-Signature header")
	ErrMissingTimestamp = errors.New("missing or malformed X-Timestamp header")
	ErrReplayDetected   = errors.New("replay detected: request timestamp outside allowed window")
	ErrInvalidSignature = errors.New("invalid HMAC signature")
)

// Validator validates HMAC-SHA256 signatures and enforces replay-prevention windows.
type Validator struct {
	maxAgeSeconds int64
}

// New returns a Validator. maxAgeSeconds is the maximum allowed age (and future drift)
// of the X-Timestamp header; architecture specifies 300s (5 minutes).
func New(maxAgeSeconds int64) *Validator {
	return &Validator{maxAgeSeconds: maxAgeSeconds}
}

// Validate verifies that sig is a valid HMAC-SHA256 signature over body using secret,
// and that the request timestamp is within the allowed window.
//
// sig must be in the form "sha256=<hex>".
// timestamp must be a Unix epoch integer string.
func (v *Validator) Validate(sig, timestamp string, body []byte, secret []byte) error {
	if sig == "" {
		return ErrMissingSignature
	}
	if timestamp == "" {
		return ErrMissingTimestamp
	}

	ts, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return ErrMissingTimestamp
	}

	now := time.Now().Unix()
	diff := now - ts
	if diff < 0 {
		diff = -diff
	}
	if diff > v.maxAgeSeconds {
		return fmt.Errorf("%w (diff=%ds, max=%ds)", ErrReplayDetected, diff, v.maxAgeSeconds)
	}

	computed := v.ComputeSignature(body, secret)
	if !hmac.Equal([]byte(computed), []byte(sig)) {
		return ErrInvalidSignature
	}

	return nil
}

// ComputeSignature computes HMAC-SHA256(body, secret) and returns it as "sha256=<hex>".
// Use this in test helpers and client SDKs to generate valid signatures.
func (v *Validator) ComputeSignature(body []byte, secret []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
