package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGetPlatformAPITools(t *testing.T) {
	svc := &Service{}
	tools := svc.getPlatformAPITools()

	if len(tools) != 6 {
		t.Errorf("expected 6 platform API tools, got %d", len(tools))
	}

	expectedTools := []string{
		"platform__trigger_agent",
		"platform__get_session",
		"platform__poll_session",
		"platform__list_hitl_approvals",
		"platform__approve_hitl",
		"platform__deny_hitl",
	}

	for i, expected := range expectedTools {
		if i >= len(tools) {
			t.Errorf("tool %d missing", i)
			continue
		}
		if tools[i].Name != expected {
			t.Errorf("tool %d: expected %s, got %s", i, expected, tools[i].Name)
		}
		if tools[i].Description == "" {
			t.Errorf("tool %s has empty description", tools[i].Name)
		}
		if tools[i].InputSchema == nil {
			t.Errorf("tool %s has nil inputSchema", tools[i].Name)
		}
	}
}

func TestInvokePlatformTool_TriggerAgent(t *testing.T) {
	mockWorkflow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/v1/sessions" {
			t.Errorf("unexpected request: %s %s", r.Method, r.URL.Path)
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"workflow_id": "test-workflow-123",
			"run_id":      "run-001",
			"status":      "RUNNING",
		})
	}))
	defer mockWorkflow.Close()

	svc := &Service{
		workflowInitiatorURL: mockWorkflow.URL,
	}

	args := map[string]interface{}{
		"agent_id": "test-agent",
		"prompt":   "test prompt",
	}

	result, err := svc.invokePlatformTool(context.Background(), "default-tenant", "platform__trigger_agent", args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result == "" {
		t.Error("expected non-empty result")
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("failed to parse result as JSON: %v", err)
	}
	if parsed["workflow_id"] != "test-workflow-123" {
		t.Errorf("unexpected workflow_id: %v", parsed["workflow_id"])
	}
}

func TestInvokePlatformTool_GetSession(t *testing.T) {
	mockWorkflow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.URL.Path != "/api/v1/sessions/test-session-123" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"workflow_id": "test-session-123",
			"status":      "COMPLETED",
			"result":      map[string]interface{}{"output": "done"},
		})
	}))
	defer mockWorkflow.Close()

	svc := &Service{
		workflowInitiatorURL: mockWorkflow.URL,
	}

	args := map[string]interface{}{
		"session_id": "test-session-123",
	}

	result, err := svc.invokePlatformTool(context.Background(), "default-tenant", "platform__get_session", args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}
	if parsed["status"] != "COMPLETED" {
		t.Errorf("unexpected status: %v", parsed["status"])
	}
}

func TestInvokePlatformTool_PollSession(t *testing.T) {
	mockWorkflow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.URL.Path != "/api/v1/sessions/test-session-123/poll" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"events": []interface{}{},
			"status": map[string]interface{}{
				"workflow_id": "test-session-123",
				"status":      "RUNNING",
			},
			"from": 0,
		})
	}))
	defer mockWorkflow.Close()

	svc := &Service{
		workflowInitiatorURL: mockWorkflow.URL,
	}

	args := map[string]interface{}{
		"session_id": "test-session-123",
	}

	result, err := svc.invokePlatformTool(context.Background(), "default-tenant", "platform__poll_session", args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}
	if parsed["from"] != 0.0 {
		t.Errorf("unexpected from: %v", parsed["from"])
	}
}

func TestInvokePlatformTool_ListHITL(t *testing.T) {
	mockWorkflow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.URL.Path != "/api/v1/approvals/pending" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"approvals": []interface{}{},
		})
	}))
	defer mockWorkflow.Close()

	svc := &Service{
		workflowInitiatorURL: mockWorkflow.URL,
	}

	result, err := svc.invokePlatformTool(context.Background(), "default-tenant", "platform__list_hitl_approvals", map[string]interface{}{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}
	if approvals, ok := parsed["approvals"]; !ok {
		t.Error("missing approvals field")
	} else if approvals == nil {
		t.Error("approvals field is nil")
	}
}

func TestInvokePlatformTool_ApproveHITL(t *testing.T) {
	mockWorkflow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/v1/approvals/test-approval-123/approve" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "approved",
		})
	}))
	defer mockWorkflow.Close()

	svc := &Service{
		workflowInitiatorURL: mockWorkflow.URL,
	}

	args := map[string]interface{}{
		"approval_id": "test-approval-123",
	}

	result, err := svc.invokePlatformTool(context.Background(), "default-tenant", "platform__approve_hitl", args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}
	if parsed["status"] != "approved" {
		t.Errorf("unexpected status: %v", parsed["status"])
	}
}

func TestInvokePlatformTool_DenyHITL(t *testing.T) {
	mockWorkflow := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/api/v1/approvals/test-approval-123/deny" {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "denied",
		})
	}))
	defer mockWorkflow.Close()

	svc := &Service{
		workflowInitiatorURL: mockWorkflow.URL,
	}

	args := map[string]interface{}{
		"approval_id": "test-approval-123",
		"reason":      "security concern",
	}

	result, err := svc.invokePlatformTool(context.Background(), "default-tenant", "platform__deny_hitl", args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(result), &parsed); err != nil {
		t.Fatalf("failed to parse result: %v", err)
	}
	if parsed["status"] == nil {
		t.Error("missing status field")
	}
}

func TestInvokePlatformTool_UnknownTool(t *testing.T) {
	svc := &Service{
		workflowInitiatorURL: "http://localhost:8081",
	}

	_, err := svc.invokePlatformTool(context.Background(), "default-tenant", "platform__unknown_tool", map[string]interface{}{})
	if err == nil {
		t.Error("expected error for unknown tool")
	}
}

func TestInvokePlatformTool_MissingRequiredArgs(t *testing.T) {
	svc := &Service{
		workflowInitiatorURL: "http://localhost:8081",
	}

	_, err := svc.invokePlatformTool(context.Background(), "default-tenant", "platform__trigger_agent", map[string]interface{}{})
	if err == nil {
		t.Error("expected error for missing agent_id")
	}
}
