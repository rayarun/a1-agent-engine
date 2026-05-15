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
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"

	_ "github.com/lib/pq"
	"github.com/a1-agent-engine/mcp-registry/pkg/service"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5433/agentplatform?sslmode=disable"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8090"
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	svc := service.NewService(db)

	// Routes
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", svc.HandleHealth)
	mux.HandleFunc("POST /api/v1/mcp/servers", svc.HandleRegisterServer)
	mux.HandleFunc("GET /api/v1/mcp/servers", svc.HandleListServers)
	mux.HandleFunc("DELETE /api/v1/mcp/servers/{id}", svc.HandleDeleteServer)
	mux.HandleFunc("GET /api/v1/mcp/servers/{id}/tools", svc.HandleDiscoverTools)
	mux.HandleFunc("POST /api/v1/mcp/servers/{id}/call", svc.HandleInvokeTool)

	addr := fmt.Sprintf(":%s", port)
	log.Printf("MCP Registry starting on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
