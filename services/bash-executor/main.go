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
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/agent-platform/bash-executor/pkg/executor"
	hmacpkg "github.com/agent-platform/webhook-security/pkg/hmac"
	"github.com/agent-platform/webhook-security/pkg/middleware"
)

const defaultPort = "8092"

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = defaultPort
	}

	maxMemoryMB, _ := strconv.Atoi(os.Getenv("MAX_MEMORY_MB"))
	if maxMemoryMB == 0 {
		maxMemoryMB = 512
	}

	maxCPUCores, _ := strconv.Atoi(os.Getenv("MAX_CPU_CORES"))
	if maxCPUCores == 0 {
		maxCPUCores = 2
	}

	maxTimeoutSeconds, _ := strconv.Atoi(os.Getenv("MAX_TIMEOUT_SECONDS"))
	if maxTimeoutSeconds == 0 {
		maxTimeoutSeconds = 3600
	}

	maxOutputBytes, _ := strconv.Atoi(os.Getenv("MAX_OUTPUT_BYTES"))
	if maxOutputBytes == 0 {
		maxOutputBytes = 64 * 1024 * 1024 // 64MB
	}

	exec := &executor.BashExecutor{
		MaxMemoryMB:       maxMemoryMB,
		MaxCPUCores:       maxCPUCores,
		MaxTimeoutSeconds: maxTimeoutSeconds,
		MaxOutputBytes:    maxOutputBytes,
	}

	// HMAC authentication on the execution endpoint. The shared middleware skips
	// validation only when WEBHOOK_HMAC_DISABLED=true (local dev only).
	hmacSecret := []byte(os.Getenv("WEBHOOK_HMAC_SECRET"))
	if len(hmacSecret) == 0 {
		hmacSecret = []byte("dev-secret")
	}
	authMW := middleware.ValidateHMAC(
		hmacpkg.New(300),
		func(_ *http.Request) ([]byte, error) { return hmacSecret, nil },
	)

	addr := ":" + port
	log.Printf("Starting Bash Executor on %s (memory: %dMB, cpu: %d cores, timeout: %ds)",
		addr, maxMemoryMB, maxCPUCores, maxTimeoutSeconds)
	if err := http.ListenAndServe(addr, newRouter(exec, authMW)); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// newRouter builds the HTTP mux. The execute endpoint is wrapped with the supplied
// auth middleware; /health is left unauthenticated for liveness probes.
func newRouter(exec *executor.BashExecutor, authMW func(http.Handler) http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.Handle("/api/v1/execute", authMW(handleExecute(exec)))
	return mux
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

func handleExecute(exec *executor.BashExecutor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		var req struct {
			Script      string            `json:"script"`
			TimeoutSec  int               `json:"timeout_seconds"`
			Environment map[string]string `json:"environment"`
			WorkingDir  string            `json:"working_dir"`
			ExecutionID string            `json:"execution_id"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
			return
		}

		if req.Script == "" {
			http.Error(w, "script is required", http.StatusBadRequest)
			return
		}

		// Security validation (allowlist + sandbox confinement) → 400 on rejection.
		if err := executor.ValidateScript(req.Script); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := executor.ValidateExecutionID(req.ExecutionID); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := executor.ValidateWorkingDir(req.WorkingDir); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Validate timeout
		if req.TimeoutSec <= 0 {
			req.TimeoutSec = 300 // default 5 min
		}
		if req.TimeoutSec > exec.MaxTimeoutSeconds {
			http.Error(w, fmt.Sprintf("timeout exceeds limit: %d > %d", req.TimeoutSec, exec.MaxTimeoutSeconds), http.StatusBadRequest)
			return
		}

		ctx, cancel := context.WithTimeout(r.Context(), time.Duration(req.TimeoutSec)*time.Second)
		defer cancel()

		result, err := exec.Execute(ctx, &executor.ExecuteRequest{
			Script:      req.Script,
			TimeoutSec:  req.TimeoutSec,
			Environment: req.Environment,
			WorkingDir:  req.WorkingDir,
			ExecutionID: req.ExecutionID,
		})

		if err != nil {
			http.Error(w, fmt.Sprintf("Execution error: %v", err), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(result)
	}
}
