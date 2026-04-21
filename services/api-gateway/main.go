package main

import (
	"log"
	"net/http"
	"os"

	"github.com/agent-platform/api-gateway/pkg/service"
)

func main() {
	initiatorURL := os.Getenv("WORKFLOW_INITIATOR_URL")
	if initiatorURL == "" {
		initiatorURL = "http://localhost:8081"
	}

	h := &service.GatewayHandler{
		InitiatorURL: initiatorURL,
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", h.HandleHealth)
	mux.HandleFunc("POST /api/v1/agents/{agent_id}/trigger", h.HandleTriggerAgent)
	mux.HandleFunc("GET /api/v1/sessions/{id}/status", h.HandleGetSessionStatus)

	log.Printf("Starting API Gateway on :8080 (Initiator: %s)", initiatorURL)
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
