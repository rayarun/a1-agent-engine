package service_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/agent-platform/tool-registry/pkg/service"
	"github.com/agent-platform/tool-registry/pkg/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testTenant = "tenant-abc"

func baseTool() *models.ToolSpec {
	return &models.ToolSpec{
		ID:          "tool-001",
		TenantID:    testTenant,
		Name:        "query-db",
		Version:     "1.0.0",
		Description: "Execute read-only SQL queries",
		AuthLevel:   models.AuthLevelRead,
		Status:      models.StatusPendingReview,
		RegisteredBy: "platform-admin",
		CreatedAt:   time.Now(),
	}
}

func newHandler(t *testing.T) (http.Handler, *store.InMemoryStore) {
	t.Helper()
	s := store.NewInMemoryStore()
	h := service.NewHandler(s)
	return service.BuildMux(h), s
}

// POST /api/v1/tools

func TestCreateTool_Returns201_WithPendingReviewStatus(t *testing.T) {
	mux, _ := newHandler(t)

	tool := baseTool()
	tool.Status = models.StatusApproved // service must force pending_review
	body, _ := json.Marshal(tool)
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/tools", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusCreated, rr.Code)
	var resp models.ToolSpec
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "tool-001", resp.ID)
	assert.Equal(t, models.StatusPendingReview, resp.Status)
}

func TestCreateTool_MissingTenantHeader_Returns400(t *testing.T) {
	mux, _ := newHandler(t)

	body, _ := json.Marshal(baseTool())
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/tools", bytes.NewReader(body))
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// GET /api/v1/tools/{id}

func TestGetTool_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	require.NoError(t, s.Create(nil, baseTool()))

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/tools/tool-001", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp models.ToolSpec
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "query-db", resp.Name)
}

func TestGetTool_NotFound_Returns404(t *testing.T) {
	mux, _ := newHandler(t)

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/tools/does-not-exist", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

// GET /api/v1/tools

func TestListTools_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	require.NoError(t, s.Create(nil, baseTool()))

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/tools", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp []*models.ToolSpec
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Len(t, resp, 1)
}

func TestListTools_StatusFilter_ReturnsOnlyApproved(t *testing.T) {
	mux, s := newHandler(t)

	pending := baseTool()
	require.NoError(t, s.Create(nil, pending))

	approved := baseTool()
	approved.ID = "tool-002"
	approved.Status = models.StatusApproved
	require.NoError(t, s.Create(nil, approved))

	req, _ := http.NewRequest(http.MethodGet, "/api/v1/tools?status=approved", nil)
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp []*models.ToolSpec
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Len(t, resp, 1)
	assert.Equal(t, "tool-002", resp[0].ID)
}

// PUT /api/v1/tools/{id}

func TestUpdateTool_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	require.NoError(t, s.Create(nil, baseTool()))

	updated := baseTool()
	updated.Description = "Updated description"
	body, _ := json.Marshal(updated)

	req, _ := http.NewRequest(http.MethodPut, "/api/v1/tools/tool-001", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp models.ToolSpec
	require.NoError(t, json.NewDecoder(rr.Body).Decode(&resp))
	assert.Equal(t, "Updated description", resp.Description)
}

// POST /api/v1/tools/{id}/transition

func TestApproveTool_TransitionsPendingReview_Returns200(t *testing.T) {
	mux, s := newHandler(t)
	require.NoError(t, s.Create(nil, baseTool())) // starts as pending_review

	body, _ := json.Marshal(models.TransitionRequest{
		TargetState: "approved",
		Actor:       "security-team",
	})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/tools/tool-001/transition", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)

	updated, _ := s.GetByID(nil, "tool-001", testTenant)
	assert.Equal(t, models.StatusApproved, updated.Status)
}

func TestApproveTool_NotFound_Returns404(t *testing.T) {
	mux, _ := newHandler(t)

	body, _ := json.Marshal(models.TransitionRequest{TargetState: "approved", Actor: "admin"})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/tools/no-such-tool/transition", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}

func TestApproveTool_InvalidTransition_Returns422(t *testing.T) {
	mux, s := newHandler(t)
	approved := baseTool()
	approved.Status = models.StatusApproved
	require.NoError(t, s.Create(nil, approved))

	body, _ := json.Marshal(models.TransitionRequest{
		TargetState: "pending_review", // approved → pending_review is not valid
		Actor:       "admin",
	})
	req, _ := http.NewRequest(http.MethodPost, "/api/v1/tools/tool-001/transition", bytes.NewReader(body))
	req.Header.Set("X-Tenant-ID", testTenant)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusUnprocessableEntity, rr.Code)
}
