package service

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/agent-platform/sub-agent-registry/pkg/store"
)

// Handler holds the registry store and implements all HTTP handler methods.
type Handler struct {
	store store.Store
}

func NewHandler(s store.Store) *Handler {
	return &Handler{store: s}
}

// BuildMux registers all sub-agent registry routes on a new ServeMux.
func BuildMux(h *Handler) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.handleHealth)
	mux.HandleFunc("POST /api/v1/sub-agents", h.handleCreate)
	mux.HandleFunc("GET /api/v1/sub-agents", h.handleList)
	mux.HandleFunc("GET /api/v1/sub-agents/{id}", h.handleGetByID)
	mux.HandleFunc("PUT /api/v1/sub-agents/{id}", h.handleUpdate)
	mux.HandleFunc("POST /api/v1/sub-agents/{id}/transition", h.handleTransition)
	return mux
}

func tenantID(r *http.Request) (string, bool) {
	tid := r.Header.Get("X-Tenant-ID")
	return tid, tid != ""
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func (h *Handler) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	w.Write([]byte("sub-agent-registry healthy\n"))
}

func (h *Handler) handleCreate(w http.ResponseWriter, r *http.Request) {
	tid, ok := tenantID(r)
	if !ok {
		http.Error(w, "X-Tenant-ID header required", http.StatusBadRequest)
		return
	}

	var c models.SubAgentContract
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	c.TenantID = tid

	if err := h.store.Create(r.Context(), &c); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, &c)
}

func (h *Handler) handleGetByID(w http.ResponseWriter, r *http.Request) {
	tid, ok := tenantID(r)
	if !ok {
		http.Error(w, "X-Tenant-ID header required", http.StatusBadRequest)
		return
	}

	id := r.PathValue("id")
	c, err := h.store.GetByID(r.Context(), id, tid)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, c)
}

func (h *Handler) handleList(w http.ResponseWriter, r *http.Request) {
	tid, ok := tenantID(r)
	if !ok {
		http.Error(w, "X-Tenant-ID header required", http.StatusBadRequest)
		return
	}

	f := store.ListFilter{
		TenantID: tid,
		Status:   r.URL.Query().Get("status"),
	}
	contracts, err := h.store.List(r.Context(), f)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if contracts == nil {
		contracts = []*models.SubAgentContract{}
	}
	writeJSON(w, http.StatusOK, contracts)
}

func (h *Handler) handleUpdate(w http.ResponseWriter, r *http.Request) {
	tid, ok := tenantID(r)
	if !ok {
		http.Error(w, "X-Tenant-ID header required", http.StatusBadRequest)
		return
	}

	id := r.PathValue("id")
	var c models.SubAgentContract
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	c.ID = id
	c.TenantID = tid

	if err := h.store.Update(r.Context(), &c); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, &c)
}

func (h *Handler) handleTransition(w http.ResponseWriter, r *http.Request) {
	tid, ok := tenantID(r)
	if !ok {
		http.Error(w, "X-Tenant-ID header required", http.StatusBadRequest)
		return
	}

	id := r.PathValue("id")
	var req models.TransitionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	target := models.ResourceStatus(req.TargetState)
	err := h.store.Transition(r.Context(), id, tid, target, req.Actor, req.Reason)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		// State machine violation.
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	c, _ := h.store.GetByID(r.Context(), id, tid)
	writeJSON(w, http.StatusOK, c)
}
