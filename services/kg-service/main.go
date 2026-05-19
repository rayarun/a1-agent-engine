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
	"log"
	"net/http"
	"os"
	"strings"

	_ "github.com/lib/pq"

	"github.com/agent-platform/kg-service/pkg/service"
	"github.com/agent-platform/kg-service/pkg/store"
)

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Tenant-ID")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func main() {
	var s store.Store
	dsn := os.Getenv("DATABASE_URL")
	if dsn != "" {
		db, err := sql.Open("postgres", dsn)
		if err != nil {
			log.Fatalf("Failed to open database: %v", err)
		}
		pg, err := store.NewPostgresStore(db)
		if err != nil {
			log.Fatalf("Failed to connect to database: %v", err)
		}
		s = pg
		log.Println("KG Service: using PostgreSQL store")
	} else {
		s = store.NewInMemoryStore()
		log.Println("KG Service: using in-memory store (set DATABASE_URL for production)")
	}

	litellmURL := os.Getenv("LITELLM_BASE_URL")
	if litellmURL == "" {
		litellmURL = "http://litellm:8000"
	} else {
		// Strip /v1 suffix if present (handler adds it)
		litellmURL = strings.TrimSuffix(litellmURL, "/v1")
	}

	h := service.NewHandler(s, litellmURL)
	mux := service.BuildMux(h)

	addr := ":8093"
	log.Printf("Starting KG Service on %s", addr)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
