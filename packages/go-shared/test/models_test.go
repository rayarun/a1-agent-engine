package test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResourceStatusConstants(t *testing.T) {
	assert.Equal(t, models.ResourceStatus("draft"), models.StatusDraft)
	assert.Equal(t, models.ResourceStatus("active"), models.StatusActive)
	assert.Equal(t, models.ResourceStatus("archived"), models.StatusArchived)
	assert.Equal(t, models.ResourceStatus("pending_review"), models.StatusPendingReview)
	assert.Equal(t, models.ResourceStatus("approved"), models.StatusApproved)
	assert.Equal(t, models.ResourceStatus("deprecated"), models.StatusDeprecated)
}

func TestToolSpec_JSONRoundTrip(t *testing.T) {
	spec := models.ToolSpec{
		ID:              "tool-1",
		TenantID:        "tenant-abc",
		Name:            "query_slow_logs",
		Version:         "1.2.0",
		Description:     "Queries RDS slow query logs",
		AuthLevel:       models.AuthLevelRead,
		SandboxRequired: false,
		InputSchema:     json.RawMessage(`{"type":"object","properties":{"target":{"type":"string"}}}`),
		Status:          models.StatusApproved,
		RegisteredBy:    "dba-team",
		CreatedAt:       time.Now().UTC().Truncate(time.Second),
	}

	b, err := json.Marshal(spec)
	require.NoError(t, err)

	var decoded models.ToolSpec
	require.NoError(t, json.Unmarshal(b, &decoded))

	assert.Equal(t, spec.ID, decoded.ID)
	assert.Equal(t, spec.TenantID, decoded.TenantID)
	assert.Equal(t, spec.Name, decoded.Name)
	assert.Equal(t, spec.Version, decoded.Version)
	assert.Equal(t, spec.AuthLevel, decoded.AuthLevel)
	assert.Equal(t, string(spec.InputSchema), string(decoded.InputSchema))
	assert.Equal(t, spec.Status, decoded.Status)
}

func TestSubAgentContract_JSONRoundTrip(t *testing.T) {
	contract := models.SubAgentContract{
		ID:       "sub-agent-1",
		TenantID: "tenant-abc",
		Name:     "db-triage-agent",
		Version:  "1.0.0",
		Persona:  "You are a database triage specialist.",
		AllowedSkills: []models.SkillRef{
			{Name: "db-triage-skill", Version: "2.1.0"},
		},
		Model:         "gpt-4o",
		MaxIterations: 5,
		Status:        models.StatusActive,
	}

	b, err := json.Marshal(contract)
	require.NoError(t, err)

	var decoded models.SubAgentContract
	require.NoError(t, json.Unmarshal(b, &decoded))

	assert.Equal(t, contract.ID, decoded.ID)
	assert.Equal(t, contract.AllowedSkills[0].Name, decoded.AllowedSkills[0].Name)
	assert.Equal(t, contract.AllowedSkills[0].Version, decoded.AllowedSkills[0].Version)
	assert.Equal(t, contract.MaxIterations, decoded.MaxIterations)
}

func TestTeamManifest_JSONRoundTrip(t *testing.T) {
	manifest := models.TeamManifest{
		ID:       "team-1",
		TenantID: "tenant-abc",
		Name:     "full-stack-triage-team",
		Version:  "1.0.0",
		Members: []models.TeamMember{
			{SubAgentID: "orchestrator-agent", SubAgentVersion: "1.0.0", Role: "orchestrator"},
			{SubAgentID: "db-triage-agent", SubAgentVersion: "1.0.0", Role: "specialist"},
			{SubAgentID: "k8s-inspector-agent", SubAgentVersion: "2.0.0", Role: "specialist"},
		},
		CoordinationStrategy: models.StrategyParallel,
		SharedMemoryScope:    "shared",
		Status:               models.StatusActive,
	}

	b, err := json.Marshal(manifest)
	require.NoError(t, err)

	var decoded models.TeamManifest
	require.NoError(t, json.Unmarshal(b, &decoded))

	assert.Equal(t, manifest.ID, decoded.ID)
	assert.Equal(t, 3, len(decoded.Members))
	assert.Equal(t, "orchestrator", decoded.Members[0].Role)
	assert.Equal(t, models.StrategyParallel, decoded.CoordinationStrategy)
}

func TestSkillManifest_JSONRoundTrip(t *testing.T) {
	skill := models.SkillManifest{
		ID:               "skill-1",
		TenantID:         "tenant-abc",
		Name:             "k8s-remediation",
		Version:          "2.1.0",
		Description:      "Kubernetes pod remediation skill",
		Tools:            []models.ToolRef{{Name: "restart_k8s_pod", Version: "2.0.0"}},
		SOP:              "Only restart pods when memory > 90%",
		Mutating:         true,
		ApprovalRequired: true,
		Hooks: []models.HookSpec{
			{Phase: "pre", Type: "audit_log"},
			{Phase: "pre", Type: "hitl_intercept"},
			{Phase: "post", Type: "cost_meter"},
		},
		Status:      models.StatusActive,
		PublishedBy: "sre-team",
	}

	b, err := json.Marshal(skill)
	require.NoError(t, err)

	var decoded models.SkillManifest
	require.NoError(t, json.Unmarshal(b, &decoded))

	assert.Equal(t, skill.Name, decoded.Name)
	assert.True(t, decoded.Mutating)
	assert.True(t, decoded.ApprovalRequired)
	assert.Equal(t, 3, len(decoded.Hooks))
	assert.Equal(t, "pre", decoded.Hooks[0].Phase)
	assert.Equal(t, "hitl_intercept", decoded.Hooks[1].Type)
}

func TestLifecycleEvent_JSONRoundTrip(t *testing.T) {
	event := models.LifecycleEvent{
		ID:           "evt-1",
		ResourceType: "sub_agent",
		ResourceID:   "sub-agent-1",
		TenantID:     "tenant-abc",
		FromState:    "staged",
		ToState:      "active",
		Actor:        "platform-admin",
		Reason:       "Post-staging review passed",
		CreatedAt:    time.Now().UTC().Truncate(time.Second),
	}

	b, err := json.Marshal(event)
	require.NoError(t, err)

	var decoded models.LifecycleEvent
	require.NoError(t, json.Unmarshal(b, &decoded))

	assert.Equal(t, event.ResourceType, decoded.ResourceType)
	assert.Equal(t, event.FromState, decoded.FromState)
	assert.Equal(t, event.ToState, decoded.ToState)
	assert.Equal(t, event.Actor, decoded.Actor)
}

func TestHITLModels_JSONRoundTrip(t *testing.T) {
	req := models.HITLRequest{
		WorkflowID:    "wf-123",
		RunID:         "run-456",
		ToolName:      "restart_k8s_pod",
		AgentID:       "k8s-inspector",
		TenantID:      "tenant-abc",
		Justification: "OOM detected on node-07",
		Evidence:      map[string]any{"pod": "api-server-6f4", "node": "node-07"},
	}

	b, err := json.Marshal(req)
	require.NoError(t, err)

	var decoded models.HITLRequest
	require.NoError(t, json.Unmarshal(b, &decoded))

	assert.Equal(t, req.WorkflowID, decoded.WorkflowID)
	assert.Equal(t, req.ToolName, decoded.ToolName)
	assert.Equal(t, "node-07", decoded.Evidence["node"])

	sig := models.HITLSignal{Approved: true, MFAToken: "totp-123456", ActorID: "sre-alice"}
	sb, err := json.Marshal(sig)
	require.NoError(t, err)
	var decodedSig models.HITLSignal
	require.NoError(t, json.Unmarshal(sb, &decodedSig))
	assert.True(t, decodedSig.Approved)
	assert.Equal(t, "sre-alice", decodedSig.ActorID)
}

func TestStartTeamRequest_JSONRoundTrip(t *testing.T) {
	req := models.StartTeamRequest{
		TeamID:         "team-1",
		SessionID:      "sess-xyz",
		TenantID:       "tenant-abc",
		IdempotencyKey: "idem-key-001",
		Context:        map[string]string{"incident_id": "INC-442"},
	}

	b, err := json.Marshal(req)
	require.NoError(t, err)

	var decoded models.StartTeamRequest
	require.NoError(t, json.Unmarshal(b, &decoded))

	assert.Equal(t, req.TeamID, decoded.TeamID)
	assert.Equal(t, req.IdempotencyKey, decoded.IdempotencyKey)
	assert.Equal(t, "INC-442", decoded.Context["incident_id"])
}

func TestCostEvent_JSONRoundTrip(t *testing.T) {
	event := models.CostEvent{
		Time:      time.Now().UTC().Truncate(time.Second),
		TenantID:  "tenant-abc",
		AgentID:   "agent-1",
		SkillID:   "skill-db-triage",
		TokensIn:  1200,
		TokensOut: 450,
		SandboxMs: 0,
		VectorOps: 3,
	}

	b, err := json.Marshal(event)
	require.NoError(t, err)

	var decoded models.CostEvent
	require.NoError(t, json.Unmarshal(b, &decoded))

	assert.Equal(t, event.TenantID, decoded.TenantID)
	assert.Equal(t, event.TokensIn, decoded.TokensIn)
	assert.Equal(t, event.VectorOps, decoded.VectorOps)
}

func TestAgentManifest_BackwardsCompat(t *testing.T) {
	// Verify existing fields still work after adding new fields.
	manifest := models.AgentManifest{
		ID:           "agent-1",
		Name:         "support-bot",
		SystemPrompt: "You are an L1 support agent.",
		Model:        "gpt-4o",
	}
	assert.Equal(t, "support-bot", manifest.Name)
	assert.Equal(t, 0, manifest.MaxIterations) // zero-value default
	assert.Equal(t, "", manifest.TenantID)     // zero-value for unset tenant
}
