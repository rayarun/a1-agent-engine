package middleware_test

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/agent-platform/webhook-security/pkg/hmac"
	"github.com/agent-platform/webhook-security/pkg/middleware"
	"github.com/stretchr/testify/assert"
)

var (
	testSecret = []byte("tenant-secret")
	testBody   = []byte(`{"incident":"P1"}`)
)

func resolver(_ *http.Request) ([]byte, error) {
	return testSecret, nil
}

func TestMiddleware_PassesThrough(t *testing.T) {
	v := hmac.New(300)
	sig := v.ComputeSignature(testBody, testSecret)
	ts := fmt.Sprintf("%d", time.Now().Unix())

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.ValidateHMAC(v, resolver)(next)

	req := httptest.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(testBody))
	req.Header.Set("X-Signature", sig)
	req.Header.Set("X-Timestamp", ts)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestMiddleware_Rejects401_BadSignature(t *testing.T) {
	v := hmac.New(300)
	ts := fmt.Sprintf("%d", time.Now().Unix())

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.ValidateHMAC(v, resolver)(next)

	req := httptest.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(testBody))
	req.Header.Set("X-Signature", "sha256=badhash")
	req.Header.Set("X-Timestamp", ts)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestMiddleware_Rejects400_ReplayAttack(t *testing.T) {
	v := hmac.New(300)
	sig := v.ComputeSignature(testBody, testSecret)
	oldTs := fmt.Sprintf("%d", time.Now().Unix()-400)

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.ValidateHMAC(v, resolver)(next)

	req := httptest.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(testBody))
	req.Header.Set("X-Signature", sig)
	req.Header.Set("X-Timestamp", oldTs)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
	assert.Contains(t, rr.Body.String(), "ReplayDetected")
}

func TestMiddleware_DisabledByEnv(t *testing.T) {
	t.Setenv("WEBHOOK_HMAC_DISABLED", "true")

	v := hmac.New(300)

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.ValidateHMAC(v, resolver)(next)

	// Send request with no HMAC headers at all — should still pass.
	req := httptest.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(testBody))
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
}

func TestMiddleware_BodyRestoredForDownstream(t *testing.T) {
	v := hmac.New(300)
	sig := v.ComputeSignature(testBody, testSecret)
	ts := fmt.Sprintf("%d", time.Now().Unix())

	var capturedBody []byte
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf := new(bytes.Buffer)
		buf.ReadFrom(r.Body)
		capturedBody = buf.Bytes()
		w.WriteHeader(http.StatusOK)
	})

	handler := middleware.ValidateHMAC(v, resolver)(next)

	req := httptest.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(testBody))
	req.Header.Set("X-Signature", sig)
	req.Header.Set("X-Timestamp", ts)

	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, testBody, capturedBody)
}
