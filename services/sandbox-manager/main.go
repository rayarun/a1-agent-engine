package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/agent-platform/sandbox-manager/pkg/sandbox"
)

func main() {
	executor, err := sandbox.NewExecutor()
	if err != nil {
		log.Fatalf("Failed to initialize Docker executor: %v", err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("POST /api/v1/execute", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Code string `json:"code"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request", http.StatusBadRequest)
			return
		}

		result, err := executor.ExecutePython(r.Context(), req.Code)
		if err != nil {
			http.Error(w, fmt.Sprintf("Execution failed: %v", err), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"result": result})
	})

	log.Println("Starting Sandbox Manager on :8082")
	if err := http.ListenAndServe(":8082", mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Sandbox Manager is healthy\n")
}
