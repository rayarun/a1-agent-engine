package service

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AdminHandler handles admin API requests.
type AdminHandler struct {
	DB       *pgxpool.Pool
	AdminKey string
}

// HandleHealth returns the service health status.
func (h *AdminHandler) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// HandleAuthVerify validates the admin API key.
func (h *AdminHandler) HandleAuthVerify(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	resp := models.AdminAuthResponse{
		Valid: true,
		Role:  "admin",
	}
	json.NewEncoder(w).Encode(resp)
}

// HandleListTenants returns all known tenants (from tenant_settings + inferred from registries).
func (h *AdminHandler) HandleListTenants(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	rows, err := h.DB.Query(r.Context(), `
		SELECT tenant_id, display_name, status, max_concurrent_workflows, token_budget_monthly, created_at, updated_at
		FROM tenant_settings
		ORDER BY created_at DESC
	`)
	if err != nil {
		http.Error(w, fmt.Sprintf("Query failed: %v", err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var tenants []models.TenantSettings
	for rows.Next() {
		var t models.TenantSettings
		if err := rows.Scan(&t.TenantID, &t.DisplayName, &t.Status, &t.MaxConcurrentWorkflows, &t.TokenBudgetMonthly, &t.CreatedAt, &t.UpdatedAt); err != nil {
			http.Error(w, fmt.Sprintf("Scan failed: %v", err), http.StatusInternalServerError)
			return
		}
		tenants = append(tenants, t)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"tenants": tenants,
		"count":   len(tenants),
	})
}

// HandleCreateTenant creates a new tenant record.
func (h *AdminHandler) HandleCreateTenant(w http.ResponseWriter, r *http.Request) {
	var req struct {
		TenantID               string `json:"tenant_id"`
		DisplayName            string `json:"display_name"`
		MaxConcurrentWorkflows int    `json:"max_concurrent_workflows,omitempty"`
		TokenBudgetMonthly     int64  `json:"token_budget_monthly,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.TenantID == "" || req.DisplayName == "" {
		http.Error(w, "tenant_id and display_name are required", http.StatusBadRequest)
		return
	}

	// Set defaults
	if req.MaxConcurrentWorkflows == 0 {
		req.MaxConcurrentWorkflows = 50
	}
	if req.TokenBudgetMonthly == 0 {
		req.TokenBudgetMonthly = 10000000
	}

	now := time.Now()
	_, err := h.DB.Exec(r.Context(), `
		INSERT INTO tenant_settings (tenant_id, display_name, status, max_concurrent_workflows, token_budget_monthly, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, req.TenantID, req.DisplayName, models.TenantStatusActive, req.MaxConcurrentWorkflows, req.TokenBudgetMonthly, now, now)

	if err != nil {
		http.Error(w, fmt.Sprintf("Insert failed: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	tenant := models.TenantSettings{
		TenantID:               req.TenantID,
		DisplayName:            req.DisplayName,
		Status:                 models.TenantStatusActive,
		MaxConcurrentWorkflows: req.MaxConcurrentWorkflows,
		TokenBudgetMonthly:     req.TokenBudgetMonthly,
		CreatedAt:              now,
		UpdatedAt:              now,
	}
	json.NewEncoder(w).Encode(tenant)
}

// HandleGetTenant retrieves a single tenant with stats.
func (h *AdminHandler) HandleGetTenant(w http.ResponseWriter, r *http.Request) {
	tenantID := r.PathValue("id")
	if tenantID == "" {
		http.Error(w, "tenant_id is required", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var settings models.TenantSettings
	err := h.DB.QueryRow(r.Context(), `
		SELECT tenant_id, display_name, status, max_concurrent_workflows, token_budget_monthly, created_at, updated_at
		FROM tenant_settings
		WHERE tenant_id = $1
	`, tenantID).Scan(&settings.TenantID, &settings.DisplayName, &settings.Status, &settings.MaxConcurrentWorkflows, &settings.TokenBudgetMonthly, &settings.CreatedAt, &settings.UpdatedAt)

	if err != nil {
		http.Error(w, "Tenant not found", http.StatusNotFound)
		return
	}

	// TODO: Query agent/skill/tool counts from registries (cross-tenant)
	// TODO: Query cost_events for this tenant

	stats := models.TenantStats{
		TenantID:      tenantID,
		AgentCount:    0,
		SkillCount:    0,
		ToolCount:     0,
		MonthlyCost:   0.0,
		Settings:      &settings,
	}

	json.NewEncoder(w).Encode(stats)
}

// HandleUpdateTenantQuota updates tenant quota settings.
func (h *AdminHandler) HandleUpdateTenantQuota(w http.ResponseWriter, r *http.Request) {
	tenantID := r.PathValue("id")
	if tenantID == "" {
		http.Error(w, "tenant_id is required", http.StatusBadRequest)
		return
	}

	var req models.TenantSettingsUpdate
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	// Build update query dynamically
	setClause := "updated_at = NOW()"
	args := []interface{}{}
	argCount := 1

	if req.MaxConcurrentWorkflows != nil {
		setClause += fmt.Sprintf(", max_concurrent_workflows = $%d", argCount)
		args = append(args, *req.MaxConcurrentWorkflows)
		argCount++
	}
	if req.TokenBudgetMonthly != nil {
		setClause += fmt.Sprintf(", token_budget_monthly = $%d", argCount)
		args = append(args, *req.TokenBudgetMonthly)
		argCount++
	}

	args = append(args, tenantID)

	query := fmt.Sprintf(`
		UPDATE tenant_settings
		SET %s
		WHERE tenant_id = $%d
		RETURNING tenant_id, display_name, status, max_concurrent_workflows, token_budget_monthly, created_at, updated_at
	`, setClause, argCount)

	var updated models.TenantSettings
	err := h.DB.QueryRow(r.Context(), query, args...).Scan(
		&updated.TenantID, &updated.DisplayName, &updated.Status,
		&updated.MaxConcurrentWorkflows, &updated.TokenBudgetMonthly,
		&updated.CreatedAt, &updated.UpdatedAt)

	if err != nil {
		http.Error(w, fmt.Sprintf("Update failed: %v", err), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(updated)
}

// HandleUpdateTenantStatus updates tenant status (active/suspended).
func (h *AdminHandler) HandleUpdateTenantStatus(w http.ResponseWriter, r *http.Request) {
	tenantID := r.PathValue("id")
	if tenantID == "" {
		http.Error(w, "tenant_id is required", http.StatusBadRequest)
		return
	}

	var req struct {
		Status models.TenantStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Status != models.TenantStatusActive && req.Status != models.TenantStatusSuspended {
		http.Error(w, "Invalid status", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	var updated models.TenantSettings
	err := h.DB.QueryRow(r.Context(), `
		UPDATE tenant_settings
		SET status = $1, updated_at = NOW()
		WHERE tenant_id = $2
		RETURNING tenant_id, display_name, status, max_concurrent_workflows, token_budget_monthly, created_at, updated_at
	`, req.Status, tenantID).Scan(
		&updated.TenantID, &updated.DisplayName, &updated.Status,
		&updated.MaxConcurrentWorkflows, &updated.TokenBudgetMonthly,
		&updated.CreatedAt, &updated.UpdatedAt)

	if err != nil {
		http.Error(w, "Tenant not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(updated)
}
