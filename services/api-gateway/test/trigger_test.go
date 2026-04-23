package test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/agent-platform/api-gateway/pkg/service"
	"github.com/agent-platform/go-shared/pkg/models"
	hmacpkg "github.com/agent-platform/webhook-security/pkg/hmac"
	mw "github.com/agent-platform/webhook-security/pkg/middleware"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var testSecret = []byte("test-hmac-secret")

// signedRequest builds a request with a valid HMAC-SHA256 signature and current timestamp.
func signedRequest(t *testing.T, method, path string, body []byte) *http.Request {
	t.Helper()
	v := hmacpkg.New(300)
	ts := strconv.FormatInt(time.Now().Unix(), 10)
	sig := v.ComputeSignature(body, testSecret)
	req, err := http.NewRequest(method, path, bytes.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", sig)
	req.Header.Set("X-Timestamp", ts)
	return req
}

// buildMux creates the full server mux with HMAC middleware wired, mirroring main.go.
func buildMux(t *testing.T, initiatorURL string) http.Handler {
	t.Helper()
	v := hmacpkg.New(300)
	resolver := func(_ *http.Request) ([]byte, error) { return testSecret, nil }
	hmacMW := mw.ValidateHMAC(v, resolver)

	store := service.NewInMemoryIdempotencyStore()
	h := &service.GatewayHandler{
		InitiatorURL:     initiatorURL,
		IdempotencyStore: store,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.HandleHealth)
	mux.Handle("POST /api/v1/agents/{agent_id}/trigger", hmacMW(http.HandlerFunc(h.HandleTriggerAgent)))
	mux.HandleFunc("GET /api/v1/sessions/{id}/status", h.HandleGetSessionStatus)
	return mux
}

func mockInitiatorServer(t *testing.T, workflowID, runID string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(models.SessionStatus{
			WorkflowID: workflowID,
			RunID:      runID,
			Status:     "RUNNING",
		})
	}))
}

// TestTriggerAgent preserves the original handler-level contract.
func TestTriggerAgent(t *testing.T) {
	initiatorMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "/api/v1/sessions", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(models.SessionStatus{WorkflowID: "wf-123", RunID: "run-123", Status: "initiated"})
	}))
	defer initiatorMock.Close()

	h := &service.GatewayHandler{InitiatorURL: initiatorMock.URL}
	body, _ := json.Marshal(models.TriggerRequest{EventSource: "manual", Payload: map[string]any{"test": "data"}})
	req, _ := http.NewRequest("POST", "/api/v1/agents/agent-123/trigger", bytes.NewBuffer(body))

	rr := httptest.NewRecorder()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/agents/{agent_id}/trigger", h.HandleTriggerAgent)
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusAccepted, rr.Code)
	var resp models.TriggerResponse
	json.NewDecoder(rr.Body).Decode(&resp)
	assert.Equal(t, "wf-123", resp.WorkflowID)
	assert.Equal(t, "initiated", resp.Status)
}

func TestTriggerAgent_ValidHMAC_Dispatches(t *testing.T) {
	srv := mockInitiatorServer(t, "wf-001", "run-001")
	defer srv.Close()

	payload, _ := json.Marshal(models.TriggerRequest{EventSource: "test", IdempotencyKey: "idem-001"})
	req := signedRequest(t, http.MethodPost, "/api/v1/agents/agent-123/trigger", payload)
	rr := httptest.NewRecorder()
	buildMux(t, srv.URL).ServeHTTP(rr, req)

	assert.Equal(t, http.StatusAccepted, rr.Code)
	var resp models.TriggerResponse
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "wf-001", resp.WorkflowID)
	assert.Equal(t, "RUNNING", resp.Status)
}

func TestTriggerAgent_InvalidHMAC_Returns401(t *testing.T) {
	srv := mockInitiatorServer(t, "wf-x", "run-x")
	defer srv.Close()

	payload, _ := json.Marshal(models.TriggerRequest{EventSource: "test"})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/agents/agent-123/trigger", bytes.NewReader(payload))
	req.Header.Set("X-Signature", "sha256=badhash")
	req.Header.Set("X-Timestamp", strconv.FormatInt(time.Now().Unix(), 10))

	rr := httptest.NewRecorder()
	buildMux(t, srv.URL).ServeHTTP(rr, req)
	assert.Equal(t, http.StatusUnauthorized, rr.Code)
}

func TestTriggerAgent_MissingHMAC_Returns400(t *testing.T) {
	srv := mockInitiatorServer(t, "wf-x", "run-x")
	defer srv.Close()

	payload, _ := json.Marshal(models.TriggerRequest{EventSource: "test"})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/agents/agent-123/trigger", bytes.NewReader(payload))

	rr := httptest.NewRecorder()
	buildMux(t, srv.URL).ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTriggerAgent_ReplayTimestamp_Returns400(t *testing.T) {
	srv := mockInitiatorServer(t, "wf-x", "run-x")
	defer srv.Close()

	payload, _ := json.Marshal(models.TriggerRequest{EventSource: "test"})
	v := hmacpkg.New(300)
	// 400 seconds ago — outside the 300s replay window.
	oldTS := strconv.FormatInt(time.Now().Unix()-400, 10)
	sig := v.ComputeSignature(payload, testSecret)

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/agents/agent-123/trigger", bytes.NewReader(payload))
	req.Header.Set("X-Signature", sig)
	req.Header.Set("X-Timestamp", oldTS)

	rr := httptest.NewRecorder()
	buildMux(t, srv.URL).ServeHTTP(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

func TestTriggerAgent_IdempotencyKey_ReturnsCached(t *testing.T) {
	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(models.SessionStatus{WorkflowID: "wf-cached", RunID: "run-cached", Status: "RUNNING"})
	}))
	defer srv.Close()

	mux := buildMux(t, srv.URL)
	payload, _ := json.Marshal(models.TriggerRequest{EventSource: "test", IdempotencyKey: "idem-dup"})

	// First request — must dispatch to initiator.
	req1 := signedRequest(t, http.MethodPost, "/api/v1/agents/agent-abc/trigger", payload)
	rr1 := httptest.NewRecorder()
	mux.ServeHTTP(rr1, req1)
	require.Equal(t, http.StatusAccepted, rr1.Code)

	// Second request with the same key — must return cached result without calling initiator.
	req2 := signedRequest(t, http.MethodPost, "/api/v1/agents/agent-abc/trigger", payload)
	rr2 := httptest.NewRecorder()
	mux.ServeHTTP(rr2, req2)
	assert.Equal(t, http.StatusOK, rr2.Code)

	var resp models.TriggerResponse
	require.NoError(t, json.NewDecoder(rr2.Body).Decode(&resp))
	assert.Equal(t, "wf-cached", resp.WorkflowID)
	assert.Equal(t, 1, callCount, "initiator must be called exactly once for a duplicate idempotency key")
}
