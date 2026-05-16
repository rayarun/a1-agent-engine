package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

func (s *Service) getPlatformAPITools() []MCPToolDefinition {
	return []MCPToolDefinition{
		{
			Name:        "platform__trigger_agent",
			Description: "Trigger a new agent workflow execution. Creates a durable session tracked via session_id. Sessions are single-use and cannot be restarted.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"agent_id": map[string]interface{}{
						"type":        "string",
						"description": "ID of the agent to execute",
					},
					"prompt": map[string]interface{}{
						"type":        "string",
						"description": "User prompt for agentic reasoning",
					},
					"tenant_id": map[string]interface{}{
						"type":        "string",
						"description": "Optional tenant scope (defaults to default-tenant)",
					},
					"session_id": map[string]interface{}{
						"type":        "string",
						"description": "Optional UUID for idempotent session creation",
					},
					"idempotency_key": map[string]interface{}{
						"type":        "string",
						"description": "Optional deduplication key for webhook retries",
					},
					"context": map[string]interface{}{
						"type":        "object",
						"description": "Optional business context (user_id, feature_flags, etc.)",
					},
				},
				"required": []string{"agent_id", "prompt"},
			},
		},
		{
			Name:        "platform__get_session",
			Description: "Retrieve the current status and result of a workflow execution. Use this for one-shot status checks.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"session_id": map[string]interface{}{
						"type":        "string",
						"description": "Session/workflow ID from platform__trigger_agent response",
					},
				},
				"required": []string{"session_id"},
			},
		},
		{
			Name:        "platform__poll_session",
			Description: "Incrementally poll for execution events. Returns events since the last 'from' cursor. Use repeated calls with the returned 'from' value to avoid re-reading events. Poll until status is COMPLETED or FAILED.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"session_id": map[string]interface{}{
						"type":        "string",
						"description": "Session ID",
					},
					"from": map[string]interface{}{
						"type":        "integer",
						"description": "Event cursor (default: 0). Start from this event index.",
					},
				},
				"required": []string{"session_id"},
			},
		},
		{
			Name:        "platform__list_hitl_approvals",
			Description: "List all pending human-in-the-loop approval requests. These are workflows blocked waiting for human decision on a sensitive tool call.",
			InputSchema: map[string]interface{}{
				"type":       "object",
				"properties": map[string]interface{}{},
				"required":   []string{},
			},
		},
		{
			Name:        "platform__approve_hitl",
			Description: "Approve a blocked tool call in a workflow. Resumes the workflow with approval decision granted.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"approval_id": map[string]interface{}{
						"type":        "string",
						"description": "Approval request ID from platform__list_hitl_approvals",
					},
					"user_id": map[string]interface{}{
						"type":        "string",
						"description": "Optional user ID for audit trail",
					},
				},
				"required": []string{"approval_id"},
			},
		},
		{
			Name:        "platform__deny_hitl",
			Description: "Deny a blocked tool call in a workflow. Permanently blocks the tool call and resumes the workflow with an error.",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"approval_id": map[string]interface{}{
						"type":        "string",
						"description": "Approval request ID",
					},
					"reason": map[string]interface{}{
						"type":        "string",
						"description": "Optional denial reason for audit trail",
					},
					"user_id": map[string]interface{}{
						"type":        "string",
						"description": "Optional user ID for audit trail",
					},
				},
				"required": []string{"approval_id"},
			},
		},
	}
}

func (s *Service) invokePlatformTool(ctx context.Context, tenantID string, toolName string, args map[string]interface{}) (string, error) {
	switch toolName {
	case "platform__trigger_agent":
		return s.invokeTriggerAgent(ctx, tenantID, args)
	case "platform__get_session":
		return s.invokeGetSession(ctx, tenantID, args)
	case "platform__poll_session":
		return s.invokePollSession(ctx, tenantID, args)
	case "platform__list_hitl_approvals":
		return s.invokeListHITL(ctx, tenantID, args)
	case "platform__approve_hitl":
		return s.invokeApproveHITL(ctx, tenantID, args)
	case "platform__deny_hitl":
		return s.invokeDenyHITL(ctx, tenantID, args)
	default:
		return "", fmt.Errorf("unknown platform tool: %s", toolName)
	}
}

func (s *Service) invokeTriggerAgent(ctx context.Context, tenantID string, args map[string]interface{}) (string, error) {
	agentID, ok := args["agent_id"].(string)
	if !ok || agentID == "" {
		return "", fmt.Errorf("missing agent_id argument")
	}

	prompt, ok := args["prompt"].(string)
	if !ok || prompt == "" {
		return "", fmt.Errorf("missing prompt argument")
	}

	tenant := tenantID
	if t, ok := args["tenant_id"].(string); ok && t != "" {
		tenant = t
	}

	body, err := json.Marshal(map[string]interface{}{
		"agent_id":   agentID,
		"prompt":     prompt,
		"tenant_id":  tenant,
		"session_id": args["session_id"],
		"context":    args["context"],
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", s.workflowInitiatorURL+"/api/v1/sessions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", tenant)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workflow-initiator returned %d: %s", resp.StatusCode, string(respBody))
	}

	return string(respBody), nil
}

func (s *Service) invokeGetSession(ctx context.Context, tenantID string, args map[string]interface{}) (string, error) {
	sessionID, ok := args["session_id"].(string)
	if !ok || sessionID == "" {
		return "", fmt.Errorf("missing session_id argument")
	}

	url := fmt.Sprintf("%s/api/v1/sessions/%s", s.workflowInitiatorURL, sessionID)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Tenant-ID", tenantID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workflow-initiator returned %d: %s", resp.StatusCode, string(respBody))
	}

	return string(respBody), nil
}

func (s *Service) invokePollSession(ctx context.Context, tenantID string, args map[string]interface{}) (string, error) {
	sessionID, ok := args["session_id"].(string)
	if !ok || sessionID == "" {
		return "", fmt.Errorf("missing session_id argument")
	}

	from := 0
	if f, ok := args["from"].(float64); ok {
		from = int(f)
	}

	url := fmt.Sprintf("%s/api/v1/sessions/%s/poll?from=%d", s.workflowInitiatorURL, sessionID, from)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Tenant-ID", tenantID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workflow-initiator returned %d: %s", resp.StatusCode, string(respBody))
	}

	return string(respBody), nil
}

func (s *Service) invokeListHITL(ctx context.Context, tenantID string, args map[string]interface{}) (string, error) {
	url := fmt.Sprintf("%s/api/v1/approvals/pending", s.workflowInitiatorURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-Tenant-ID", tenantID)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workflow-initiator returned %d: %s", resp.StatusCode, string(respBody))
	}

	return string(respBody), nil
}

func (s *Service) invokeApproveHITL(ctx context.Context, tenantID string, args map[string]interface{}) (string, error) {
	approvalID, ok := args["approval_id"].(string)
	if !ok || approvalID == "" {
		return "", fmt.Errorf("missing approval_id argument")
	}

	url := fmt.Sprintf("%s/api/v1/approvals/%s/approve", s.workflowInitiatorURL, approvalID)

	body, err := json.Marshal(map[string]interface{}{})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", tenantID)

	if userID, ok := args["user_id"].(string); ok && userID != "" {
		req.Header.Set("X-User-ID", userID)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workflow-initiator returned %d: %s", resp.StatusCode, string(respBody))
	}

	return string(respBody), nil
}

func (s *Service) invokeDenyHITL(ctx context.Context, tenantID string, args map[string]interface{}) (string, error) {
	approvalID, ok := args["approval_id"].(string)
	if !ok || approvalID == "" {
		return "", fmt.Errorf("missing approval_id argument")
	}

	url := fmt.Sprintf("%s/api/v1/approvals/%s/deny", s.workflowInitiatorURL, approvalID)

	denyBody := map[string]interface{}{}
	if reason, ok := args["reason"].(string); ok && reason != "" {
		denyBody["reason"] = reason
	}

	body, err := json.Marshal(denyBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Tenant-ID", tenantID)

	if userID, ok := args["user_id"].(string); ok && userID != "" {
		req.Header.Set("X-User-ID", userID)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("workflow-initiator returned %d: %s", resp.StatusCode, string(respBody))
	}

	return string(respBody), nil
}
