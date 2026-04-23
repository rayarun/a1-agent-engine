package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/agent-platform/go-shared/pkg/models"
)

// IdempotencyStore deduplicates inbound webhook events by idempotency key.
type IdempotencyStore interface {
	Get(key string) (*models.IdempotencyEntry, bool)
	Set(key string, entry models.IdempotencyEntry)
}

// InMemoryIdempotencyStore is a thread-safe, sync.Map-backed implementation.
// Keys are never evicted; use a Redis-backed store in production for TTL support.
type InMemoryIdempotencyStore struct {
	m sync.Map
}

func NewInMemoryIdempotencyStore() *InMemoryIdempotencyStore {
	return &InMemoryIdempotencyStore{}
}

func (s *InMemoryIdempotencyStore) Get(key string) (*models.IdempotencyEntry, bool) {
	v, ok := s.m.Load(key)
	if !ok {
		return nil, false
	}
	e := v.(models.IdempotencyEntry)
	return &e, true
}

func (s *InMemoryIdempotencyStore) Set(key string, entry models.IdempotencyEntry) {
	s.m.Store(key, entry)
}

// GatewayHandler handles requests to the API Gateway.
type GatewayHandler struct {
	InitiatorURL     string
	IdempotencyStore IdempotencyStore
}

// HandleTriggerAgent handles triggering an agent workflow.
func (h *GatewayHandler) HandleTriggerAgent(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("agent_id")
	if agentID == "" {
		http.Error(w, "agent_id is required", http.StatusBadRequest)
		return
	}

	var triggerReq models.TriggerRequest
	if err := json.NewDecoder(r.Body).Decode(&triggerReq); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Return cached workflow ID for duplicate idempotency keys (NFR9).
	if h.IdempotencyStore != nil && triggerReq.IdempotencyKey != "" {
		if cached, ok := h.IdempotencyStore.Get(triggerReq.IdempotencyKey); ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(models.TriggerResponse{
				WorkflowID: cached.WorkflowID,
				RunID:      cached.RunID,
				Status:     "RUNNING",
			})
			return
		}
	}

	startReq := models.StartSessionRequest{
		AgentID:        agentID,
		SessionID:      fmt.Sprintf("sess-%d", time.Now().UnixMilli()),
		IdempotencyKey: triggerReq.IdempotencyKey,
		Context:        map[string]string{"source": triggerReq.EventSource},
	}
	body, _ := json.Marshal(startReq)

	resp, err := http.Post(fmt.Sprintf("%s/api/v1/sessions", h.InitiatorURL), "application/json", bytes.NewBuffer(body))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to call initiator: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		var errBody bytes.Buffer
		errBody.ReadFrom(resp.Body)
		http.Error(w, fmt.Sprintf("Initiator failed: %s", errBody.String()), http.StatusBadGateway)
		return
	}

	var sessionStatus models.SessionStatus
	if err := json.NewDecoder(resp.Body).Decode(&sessionStatus); err != nil {
		http.Error(w, "Failed to decode initiator response", http.StatusInternalServerError)
		return
	}

	triggerResp := models.TriggerResponse{
		WorkflowID: sessionStatus.WorkflowID,
		RunID:      sessionStatus.RunID,
		Status:     sessionStatus.Status,
	}

	// Cache the result for future duplicate requests.
	if h.IdempotencyStore != nil && triggerReq.IdempotencyKey != "" {
		h.IdempotencyStore.Set(triggerReq.IdempotencyKey, models.IdempotencyEntry{
			WorkflowID: sessionStatus.WorkflowID,
			RunID:      sessionStatus.RunID,
			CreatedAt:  time.Now(),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(triggerResp)
}

// HandleGetSessionStatus proxies the status request to the Workflow Initiator.
func (h *GatewayHandler) HandleGetSessionStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "workflow id is required", http.StatusBadRequest)
		return
	}

	resp, err := http.Get(fmt.Sprintf("%s/api/v1/sessions/%s", h.InitiatorURL, id))
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to call initiator: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		http.Error(w, "Initiator failed to find session", http.StatusNotFound)
		return
	}

	var status models.SessionStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		http.Error(w, "Failed to decode response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// HandleChatStream starts an agent workflow for the given agent ID and streams
// its events back to the caller as Server-Sent Events.
func (h *GatewayHandler) HandleChatStream(w http.ResponseWriter, r *http.Request) {
	agentID := r.PathValue("id")
	if agentID == "" {
		http.Error(w, "agent id is required", http.StatusBadRequest)
		return
	}

	// EventSource only supports GET; read message and tenant from query params.
	message := r.URL.Query().Get("message")
	if message == "" {
		http.Error(w, "message query param is required", http.StatusBadRequest)
		return
	}
	tenantID := r.URL.Query().Get("tenant_id")
	if tenantID == "" {
		tenantID = r.Header.Get("X-Tenant-ID")
	}
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	// Start the workflow.
	startReq := models.StartSessionRequest{
		AgentID:   agentID,
		SessionID: fmt.Sprintf("chat-%d", time.Now().UnixMilli()),
		TenantID:  tenantID,
		Prompt:    message,
	}
	body, _ := json.Marshal(startReq)
	initiatorResp, err := http.Post(
		fmt.Sprintf("%s/api/v1/sessions", h.InitiatorURL),
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to start session: %v", err), http.StatusBadGateway)
		return
	}
	defer initiatorResp.Body.Close()
	if initiatorResp.StatusCode != http.StatusCreated {
		var buf bytes.Buffer
		buf.ReadFrom(initiatorResp.Body)
		http.Error(w, fmt.Sprintf("initiator error: %s", buf.String()), http.StatusBadGateway)
		return
	}
	var session models.SessionStatus
	if err := json.NewDecoder(initiatorResp.Body).Decode(&session); err != nil {
		http.Error(w, "failed to decode session", http.StatusInternalServerError)
		return
	}

	// Set SSE response headers.
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	// Commit headers immediately so the client sees the stream open.
	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	poll := &http.Client{Timeout: 5 * time.Second}
	cursor := 0
	terminal := map[string]bool{
		"COMPLETED": true, "FAILED": true,
		"CANCELED": true, "TIMED_OUT": true, "TERMINATED": true,
	}

	writeEvent := func(ev models.AgentEvent) {
		data, _ := json.Marshal(ev)
		fmt.Fprintf(w, "data: %s\n\n", data)
	}

	for {
		select {
		case <-r.Context().Done():
			return
		default:
		}

		// Drain any new events from the workflow query.
		if evResp, err := poll.Get(fmt.Sprintf("%s/api/v1/sessions/%s/events?from=%d", h.InitiatorURL, session.WorkflowID, cursor)); err == nil {
			var events []models.AgentEvent
			if json.NewDecoder(evResp.Body).Decode(&events) == nil && len(events) > 0 {
				for _, ev := range events {
					writeEvent(ev)
					cursor++
				}
				flusher.Flush()
			}
			evResp.Body.Close()
		}

		// Check workflow status.
		stURL := fmt.Sprintf("%s/api/v1/sessions/%s", h.InitiatorURL, session.WorkflowID)
		if stResp, err := poll.Get(stURL); err == nil {
			var st models.SessionStatus
			if json.NewDecoder(stResp.Body).Decode(&st) == nil && terminal[st.Status] {
				stResp.Body.Close()
				// Final drain to pick up any events emitted just before completion.
				drainURL := fmt.Sprintf("%s/api/v1/sessions/%s/events?from=%d", h.InitiatorURL, session.WorkflowID, cursor)
				if drainResp, err := poll.Get(drainURL); err == nil {
					var events []models.AgentEvent
					if json.NewDecoder(drainResp.Body).Decode(&events) == nil {
						for _, ev := range events {
							writeEvent(ev)
						}
					}
					drainResp.Body.Close()
				}
				if st.Status != "COMPLETED" {
					writeEvent(models.AgentEvent{Type: "error", Content: st.Status})
				}
				flusher.Flush()
				return
			}
			stResp.Body.Close()
		}

		time.Sleep(200 * time.Millisecond)
	}
}

// HandleHealth returns the health status of the service.
func (h *GatewayHandler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "API Gateway is healthy\n")
}
