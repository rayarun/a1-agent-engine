// Copyright 2026 Arun Ray
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/agent-platform/api-gateway/pkg/service"
	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/stretchr/testify/assert"
)

// TestTerminateSession_ProxiesToInitiator verifies the gateway forwards the
// terminate to the initiator's POST /sessions/{id}/terminate and relays the
// status/body back to the caller.
func TestTerminateSession_ProxiesToInitiator(t *testing.T) {
	var gotMethod, gotPath, gotTenant string
	initiator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath, gotTenant = r.Method, r.URL.Path, r.Header.Get("X-Tenant-ID")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(models.SessionStatus{WorkflowID: "wf-stop", Status: "TERMINATED"})
	}))
	defer initiator.Close()

	h := &service.GatewayHandler{InitiatorURL: initiator.URL}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/sessions/{id}/terminate", h.HandleTerminateSession)

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/sessions/wf-stop/terminate", nil)
	req.Header.Set("X-Tenant-ID", "tenant-7")
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, http.MethodPost, gotMethod)
	assert.Equal(t, "/api/v1/sessions/wf-stop/terminate", gotPath)
	assert.Equal(t, "tenant-7", gotTenant)

	var resp models.SessionStatus
	json.NewDecoder(rr.Body).Decode(&resp)
	assert.Equal(t, "TERMINATED", resp.Status)
	assert.Equal(t, "wf-stop", resp.WorkflowID)
}

// TestTerminateSession_InitiatorError relays the initiator's non-2xx status.
func TestTerminateSession_InitiatorError(t *testing.T) {
	initiator := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer initiator.Close()

	h := &service.GatewayHandler{InitiatorURL: initiator.URL}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/v1/sessions/{id}/terminate", h.HandleTerminateSession)

	req, _ := http.NewRequest(http.MethodPost, "/api/v1/sessions/wf-x/terminate", nil)
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusInternalServerError, rr.Code)
}
