package middleware

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"os"

	"github.com/agent-platform/webhook-security/pkg/hmac"
)

// SecretResolver resolves the per-tenant HMAC secret from the incoming request.
// For Phase 1 this returns a static env-var secret; Phase 2 will delegate to AWS Secrets Manager.
type SecretResolver func(r *http.Request) ([]byte, error)

// ValidateHMAC returns a middleware that validates HMAC-SHA256 signatures on inbound requests.
// When the env var WEBHOOK_HMAC_DISABLED=true is set, validation is skipped (local dev only).
//
// On validation failure:
//   - Missing/malformed headers → 400
//   - Replay detected           → 400 with body "ReplayDetected"
//   - Invalid signature         → 401
//
// The raw request body is fully buffered and restored before passing to the next handler.
func ValidateHMAC(v *hmac.Validator, resolver SecretResolver) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if os.Getenv("WEBHOOK_HMAC_DISABLED") == "true" {
				next.ServeHTTP(w, r)
				return
			}

			// Buffer the body so it can be read twice (validation + downstream handler).
			rawBody, err := io.ReadAll(r.Body)
			if err != nil {
				http.Error(w, "failed to read request body", http.StatusBadRequest)
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(rawBody))

			secret, err := resolver(r)
			if err != nil {
				http.Error(w, "failed to resolve HMAC secret", http.StatusInternalServerError)
				return
			}

			sig := r.Header.Get("X-Signature")
			ts := r.Header.Get("X-Timestamp")

			if err := v.Validate(sig, ts, rawBody, secret); err != nil {
				switch {
				case errors.Is(err, hmac.ErrReplayDetected):
					http.Error(w, "ReplayDetected", http.StatusBadRequest)
				case errors.Is(err, hmac.ErrMissingSignature),
					errors.Is(err, hmac.ErrMissingTimestamp):
					http.Error(w, err.Error(), http.StatusBadRequest)
				case errors.Is(err, hmac.ErrInvalidSignature):
					http.Error(w, "Unauthorized", http.StatusUnauthorized)
				default:
					http.Error(w, "signature validation failed", http.StatusUnauthorized)
				}
				return
			}

			// Restore body for downstream handler consumption.
			r.Body = io.NopCloser(bytes.NewReader(rawBody))
			next.ServeHTTP(w, r)
		})
	}
}
