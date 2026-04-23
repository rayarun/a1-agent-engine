package service_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/agent-platform/agent-registry/pkg/service"
	"github.com/agent-platform/agent-registry/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testTenant = "tenant-abc"

func baseManifest() *models.AgentManifest {
	return &models.AgentManifest{
		ID:       "agent-001",
		TenantID: testTenant,
		Name:     "incident-responder",
		Version:  "1.0.0",
		SystemPrompt: "You are an expert incident responder.",
		Skills: []models.SkillRef{
			{Name: "query-slow-logs", Version: "1.2.0"},
		},
		Model:          "claude-opus-4-7",
		MaxIterations:  20,
		MemoryBudgetMB: 256,
	}
}

func newHandler(t *testing.T) (http.Handler, *store.InMemoryStore) {
	t.Helper()
	s := store.NewInMemoryStore()
	h := service.NewHandler(s)
	return service.BuildMux(h), s
}

// POST /api/v1/agents

func TestCreateAgent_Returns201_WithDraftStatus(t *testing.T) {
	mux, _ := newHandler(t)

	body, _ := json.Marshal(baseManifest())
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/agents", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var resp store.AgentRecord
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "agent-001", resp.ID)
	assert.Equal(t, models.StatusDraft, resp.Status)
}

func TestCreateAgent_MissingTenantHeader_Returns400(t *testing.T) {
	mux, _ := newHandler(t)

	body, _ := json.Marshal(baseManifest())
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/agents", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// GET /api/v1/agents/{id}

func TestGetAgent_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	rec := &store.AgentRecord{AgentManifest: *baseManifest(), Status: models.StatusDraft}
	require.NoError(t, s.Create(nil, rec))

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/agents/agent-001", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp store.AgentRecord
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "incident-responder", resp.Name)
}

func TestGetAgent_NotFound_Returns404(t *testing.T) {
	mux, _ := newHandler(t)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/agents/does-not-exist", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

// GET /api/v1/agents

func TestListAgents_StatusFilter(t *testing.T) {
	mux, s := newHandler(t)

	draft := &store.AgentRecord{AgentManifest: *baseManifest(), Status: models.StatusDraft}
	require.NoError(t, s.Create(nil, draft))

	active := &store.AgentRecord{AgentManifest: *baseManifest(), Status: models.StatusActive}
	active.ID = "agent-002"
	require.NoError(t, s.Create(nil, active))

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/agents?status=active", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp []*store.AgentRecord
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Len(t, resp, 1)
	assert.Equal(t, "agent-002", resp[0].ID)
}

// PUT /api/v1/agents/{id}

func TestUpdateAgent_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	rec := &store.AgentRecord{AgentManifest: *baseManifest(), Status: models.StatusDraft}
	require.NoError(t, s.Create(nil, rec))

	updated := baseManifest()
	updated.SystemPrompt = "Updated system prompt"
	body, _ := json.Marshal(updated)

	req, _ := http.NewRequest(http.MethodPut, "/api/v1/agents/agent-001", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp store.AgentRecord
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "Updated system prompt", resp.SystemPrompt)
}

// POST /api/v1/agents/{id}/transition

func TestTransitionAgent_ValidTransition_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	rec := &store.AgentRecord{AgentManifest: *baseManifest(), Status: models.StatusDraft}
	require.NoError(t, s.Create(nil, rec))

	body, _ := json.Marshal(models.TransitionRequest{
		TargetState: "staged",
		Actor:       "platform-admin",
	})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/agents/agent-001/transition", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	updated, _ := s.GetByID(nil, "agent-001", testTenant)
	assert.Equal(t, models.StatusStaged, updated.Status)
}

func TestTransitionAgent_InvalidTransition_Returns422(t *testing.T) {
	mux, s := newHandler(t)
	rec := &store.AgentRecord{AgentManifest: *baseManifest(), Status: models.StatusDraft}
	require.NoError(t, s.Create(nil, rec))

	body, _ := json.Marshal(models.TransitionRequest{
		TargetState: "active", // Draft → Active is not valid
		Actor:       "platform-admin",
	})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/agents/agent-001/transition", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code)
}
