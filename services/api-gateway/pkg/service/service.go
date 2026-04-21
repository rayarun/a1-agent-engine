package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/agent-platform/go-shared/pkg/models"
)

// GatewayHandler handles requests to the API Gateway.
type GatewayHandler struct {
	InitiatorURL string
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

	// Prepare request for Workflow Initiator
	startReq := models.StartSessionRequest{
		AgentID:   agentID,
		SessionID: fmt.Sprintf("sess-%d", SystemTimeNowUnix()), // Mock session ID
		Context:   map[string]string{"source": triggerReq.EventSource},
	}
	body, _ := json.Marshal(startReq)

	// Call Workflow Initiator
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

	// Map to TriggerResponse
	triggerResp := models.TriggerResponse{
		WorkflowID: sessionStatus.WorkflowID,
		RunID:      sessionStatus.RunID,
		Status:     sessionStatus.Status,
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

	// Call Workflow Initiator
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

// SystemTimeNowUnix is a helper for mocking or getting current time.
func SystemTimeNowUnix() int64 {
	// In a real app, use time.Now().Unix()
	return 1234567890
}

// HandleHealth returns the health status of the service.
func (h *GatewayHandler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "API Gateway is healthy\n")
}
