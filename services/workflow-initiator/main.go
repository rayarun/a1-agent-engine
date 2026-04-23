package main

import (
	"log"
	"net/http"

	"github.com/agent-platform/workflow-initiator/pkg/service"
)

func main() {
	// Initialize Temporal client
	if err := service.InitTemporalClient(); err != nil {
		log.Fatalf("Failed to initialize Temporal client: %v", err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", service.HandleHealth)
	mux.HandleFunc("POST /api/v1/sessions", service.HandleStartSession)
	mux.HandleFunc("GET /api/v1/sessions/{id}", service.HandleGetSessionStatus)
	mux.HandleFunc("GET /api/v1/sessions/{id}/events", service.HandleGetSessionEvents)

	log.Println("Starting Workflow Initiator on :8081")
	if err := http.ListenAndServe(":8081", mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
