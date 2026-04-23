package service_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/agent-platform/sub-agent-registry/pkg/service"
	"github.com/agent-platform/sub-agent-registry/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testTenant = "tenant-test"

func baseContract() *models.SubAgentContract {
	return &models.SubAgentContract{
		ID:       "sub-001",
		TenantID: testTenant,
		Name:     "db-triage",
		Version:  "1.0.0",
		Persona:  "You are a database triage expert.",
		AllowedSkills: []models.SkillRef{
			{Name: "query-slow-logs", Version: "1.2.0"},
		},
		Model:         "gpt-4o",
		MaxIterations: 10,
		Status:        models.StatusDraft,
		CreatedAt:     time.Now(),
	}
}

func newHandler(t *testing.T) (http.Handler, *store.InMemoryStore) {
	t.Helper()
	s := store.NewInMemoryStore()
	h := service.NewHandler(s)
	return service.BuildMux(h), s
}

// POST /api/v1/sub-agents — happy path

func TestCreateSubAgent_Returns201(t *testing.T) {
	mux, _ := newHandler(t)

	body, _ := json.Marshal(baseContract())
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/sub-agents", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var resp models.SubAgentContract
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "sub-001", resp.ID)
	assert.Equal(t, models.StatusDraft, resp.Status)
}

func TestCreateSubAgent_MissingTenantHeader_Returns400(t *testing.T) {
	mux, _ := newHandler(t)

	body, _ := json.Marshal(baseContract())
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/sub-agents", bytes.NewReader(body))
	// No X-Tenant-ID header
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// GET /api/v1/sub-agents/{id}

func TestGetSubAgent_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	require.NoError(t, s.Create(nil, baseContract()))

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/sub-agents/sub-001", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp models.SubAgentContract
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "db-triage", resp.Name)
}

func TestGetSubAgent_NotFound_Returns404(t *testing.T) {
	mux, _ := newHandler(t)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/sub-agents/does-not-exist", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

// GET /api/v1/sub-agents — list with optional status filter

func TestListSubAgents_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	c := baseContract()
	require.NoError(t, s.Create(nil, c))

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/sub-agents", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp []*models.SubAgentContract
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Len(t, resp, 1)
}

func TestListSubAgents_StatusFilter(t *testing.T) {
	mux, s := newHandler(t)

	draft := baseContract()
	require.NoError(t, s.Create(nil, draft))

	active := baseContract()
	active.ID = "sub-002"
	active.Status = models.StatusActive
	require.NoError(t, s.Create(nil, active))

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/sub-agents?status=active", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp []*models.SubAgentContract
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Len(t, resp, 1)
	assert.Equal(t, "sub-002", resp[0].ID)
}

// PUT /api/v1/sub-agents/{id}

func TestUpdateSubAgent_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	require.NoError(t, s.Create(nil, baseContract()))

	updated := baseContract()
	updated.Persona = "Updated persona"
	body, _ := json.Marshal(updated)

	req, _ := http.NewRequest(http.MethodPut, "/api/v1/sub-agents/sub-001", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp models.SubAgentContract
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "Updated persona", resp.Persona)
}

// POST /api/v1/sub-agents/{id}/transition

func TestTransitionSubAgent_ValidTransition_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	require.NoError(t, s.Create(nil, baseContract())) // starts as Draft

	body, _ := json.Marshal(models.TransitionRequest{
		TargetState: "staged",
		Actor:       "platform-admin",
	})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/sub-agents/sub-001/transition", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	// Verify persisted state.
	updated, _ := s.GetByID(nil, "sub-001", testTenant)
	assert.Equal(t, models.StatusStaged, updated.Status)
}

func TestTransitionSubAgent_InvalidTransition_Returns422(t *testing.T) {
	mux, s := newHandler(t)
	require.NoError(t, s.Create(nil, baseContract())) // Draft

	body, _ := json.Marshal(models.TransitionRequest{
		TargetState: "active", // Draft → Active is not a valid edge
		Actor:       "platform-admin",
	})
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("/api/v1/sub-agents/sub-001/transition"), bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code)
}
