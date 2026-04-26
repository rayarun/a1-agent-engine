package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/agent-platform/admin-api/pkg/service"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	// Database setup
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5433/agentplatform"
	}

	dbPool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Failed to create db pool: %v", err)
	}
	defer dbPool.Close()

	adminAPIKey := os.Getenv("ADMIN_API_KEY")
	if adminAPIKey == "" {
		adminAPIKey = "dev-admin-key"
	}

	handler := &service.AdminHandler{
		DB:         dbPool,
		AdminKey:   adminAPIKey,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handler.HandleHealth)
	mux.Handle("POST /api/v1/admin/auth/verify", authMiddleware(adminAPIKey, http.HandlerFunc(handler.HandleAuthVerify)))
	mux.Handle("GET /api/v1/admin/tenants", authMiddleware(adminAPIKey, http.HandlerFunc(handler.HandleListTenants)))
	mux.Handle("POST /api/v1/admin/tenants", authMiddleware(adminAPIKey, http.HandlerFunc(handler.HandleCreateTenant)))
	mux.Handle("GET /api/v1/admin/tenants/{id}", authMiddleware(adminAPIKey, http.HandlerFunc(handler.HandleGetTenant)))
	mux.Handle("PUT /api/v1/admin/tenants/{id}/quota", authMiddleware(adminAPIKey, http.HandlerFunc(handler.HandleUpdateTenantQuota)))
	mux.Handle("PUT /api/v1/admin/tenants/{id}/status", authMiddleware(adminAPIKey, http.HandlerFunc(handler.HandleUpdateTenantStatus)))

	log.Printf("Starting Admin API on :8089 (Admin Key: %s...)", adminAPIKey[:10])
	if err := http.ListenAndServe(":8089", withCORS(mux)); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func authMiddleware(expectedKey string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			authHeader = r.Header.Get("X-Admin-Key")
		}

		if authHeader == "" {
			http.Error(w, "Unauthorized: missing Authorization header", http.StatusUnauthorized)
			return
		}

		// Expect "Bearer <key>" format
		if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
			authHeader = authHeader[7:]
		}

		if authHeader != expectedKey {
			http.Error(w, "Unauthorized: invalid key", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}
