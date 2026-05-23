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

package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/agent-platform/api-gateway/pkg/service"
	hmacpkg "github.com/agent-platform/webhook-security/pkg/hmac"
	"github.com/agent-platform/webhook-security/pkg/middleware"
)

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		logMsg := fmt.Sprintf("[CORS] Request: method=%s, path=%s, upgrade=%s\n", r.Method, r.URL.Path, r.Header.Get("Upgrade"))
		os.WriteFile("/tmp/cors.log", []byte(logMsg), 0644)
		log.Printf("[CORS] Request: method=%s, path=%s, upgrade=%s", r.Method, r.URL.Path, r.Header.Get("Upgrade"))
		if r.URL.Path == "/api/v1/agents/test-agent-valid/ws" {
			log.Printf("WebSocket request: method=%s, upgrade=%s, connection=%s", r.Method, r.Header.Get("Upgrade"), r.Header.Get("Connection"))
		}
		// Skip CORS handling for WebSocket upgrade requests
		if r.Header.Get("Upgrade") == "websocket" {
			log.Printf("[CORS] WebSocket upgrade requested for %s", r.URL.Path)
			os.WriteFile("/tmp/cors.log", []byte(fmt.Sprintf("[CORS] WebSocket upgrade for %s\n", r.URL.Path)), 0644)
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Tenant-ID")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	initiatorURL := os.Getenv("WORKFLOW_INITIATOR_URL")
	if initiatorURL == "" {
		initiatorURL = "http://localhost:8081"
	}

	workflowServiceURL := os.Getenv("WORKFLOW_SERVICE_URL")
	if workflowServiceURL == "" {
		workflowServiceURL = "http://localhost:8094"
	}

	agentRegistryURL := os.Getenv("AGENT_REGISTRY_URL")
	if agentRegistryURL == "" {
		agentRegistryURL = "http://localhost:8088"
	}

	hmacSecret := []byte(os.Getenv("WEBHOOK_HMAC_SECRET"))
	if len(hmacSecret) == 0 {
		hmacSecret = []byte("dev-secret")
	}

	hmacMW := middleware.ValidateHMAC(
		hmacpkg.New(300),
		func(_ *http.Request) ([]byte, error) { return hmacSecret, nil },
	)

	store := service.NewInMemoryIdempotencyStore()
	h := &service.GatewayHandler{
		InitiatorURL:        initiatorURL,
		WorkflowServiceURL:  workflowServiceURL,
		AgentRegistryURL:    agentRegistryURL,
		IdempotencyStore:    store,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.HandleHealth)
	mux.Handle("POST /api/v1/agents/{agent_id}/trigger", hmacMW(http.HandlerFunc(h.HandleTriggerAgent)))
	mux.HandleFunc("GET /api/v1/sessions/{id}/status", h.HandleGetSessionStatus)
	mux.HandleFunc("POST /api/v1/agents/manifest-assistant/chat", h.HandleManifestAssistantChat)
	mux.HandleFunc("GET /api/v1/agents/{id}/chat", h.HandleChatStream)
	mux.HandleFunc("POST /api/v1/agents/{id}/chat", h.HandleChatStream)
	mux.HandleFunc("GET /api/v1/agents/{id}/ws", h.HandleChatWS)
	// Agent Registry proxy routes (must come after specific routes like /chat, /ws)
	mux.HandleFunc("GET /api/v1/agents", h.ProxyAgentRegistry)
	mux.HandleFunc("POST /api/v1/agents", h.ProxyAgentRegistry)
	mux.HandleFunc("GET /api/v1/agents/{id}", h.ProxyAgentRegistry)
	mux.HandleFunc("PUT /api/v1/agents/{id}", h.ProxyAgentRegistry)
	mux.HandleFunc("DELETE /api/v1/agents/{id}", h.ProxyAgentRegistry)
	// Workflow Service proxy routes
	mux.HandleFunc("GET /api/v1/workflows", h.ProxyWorkflowService)
	mux.HandleFunc("POST /api/v1/workflows", h.ProxyWorkflowService)
	mux.HandleFunc("GET /api/v1/workflows/{id}", h.ProxyWorkflowService)
	mux.HandleFunc("PUT /api/v1/workflows/{id}", h.ProxyWorkflowService)
	mux.HandleFunc("DELETE /api/v1/workflows/{id}", h.ProxyWorkflowService)
	mux.HandleFunc("POST /api/v1/workflows/{id}/trigger", h.ProxyWorkflowService)
	mux.HandleFunc("GET /api/v1/workflows/{id}/runs", h.ProxyWorkflowService)
	mux.HandleFunc("GET /api/v1/workflow-runs/{id}", h.ProxyWorkflowService)
	mux.HandleFunc("POST /api/v1/workflow-runs/{id}/cancel", h.ProxyWorkflowService)

	log.Printf("Starting API Gateway on :8080 (Initiator: %s)", initiatorURL)
	if err := http.ListenAndServe(":8080", withCORS(mux)); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
