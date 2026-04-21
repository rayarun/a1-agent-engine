package test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/agent-platform/api-gateway/pkg/service"
	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/stretchr/testify/assert"
)

func TestTriggerAgent(t *testing.T) {
	// 1. Mock the Workflow Initiator
	initiatorMock := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.Equal(t, "/api/v1/sessions", r.URL.Path)

		resp := models.SessionStatus{
			WorkflowID: "wf-123",
			RunID:      "run-123",
			Status:     "initiated",
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(resp)
	}))
	defer initiatorMock.Close()

	// 2. Setup the Gateway handler with the mock initiator URL
	h := &service.GatewayHandler{
		InitiatorURL: initiatorMock.URL,
	}

	// 3. Create the request to the Gateway
	reqBody := models.TriggerRequest{
		EventSource: "manual",
		Payload:     map[string]any{"test": "data"},
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/v1/agents/agent-123/trigger", bytes.NewBuffer(body))
	// Add path param manually since we are calling the handler directly without the mux
	// In Go 1.22, the mux sets these. For direct handler test, we might need a workaround or test via mux.
	
	rr := httptest.NewRecorder()
	
	// Test via mux to ensure path params work
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/agents/{agent_id}/trigger", h.HandleTriggerAgent)
	
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusAccepted, rr.Code)

	var resp models.TriggerResponse
	json.NewDecoder(rr.Body).Decode(&resp)
	assert.Equal(t, "wf-123", resp.WorkflowID)
	assert.Equal(t, "initiated", resp.Status)
}
