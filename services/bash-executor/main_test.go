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
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/agent-platform/bash-executor/pkg/executor"
	hmacpkg "github.com/agent-platform/webhook-security/pkg/hmac"
	mw "github.com/agent-platform/webhook-security/pkg/middleware"
)

var testSecret = []byte("test-bash-executor-secret")

func testRouter() http.Handler {
	exec := &executor.BashExecutor{
		MaxMemoryMB:       256,
		MaxCPUCores:       2,
		MaxTimeoutSeconds: 300,
		MaxOutputBytes:    64 * 1024,
	}
	authMW := mw.ValidateHMAC(
		hmacpkg.New(300),
		func(_ *http.Request) ([]byte, error) { return testSecret, nil },
	)
	return newRouter(exec, authMW)
}

func signedExecuteRequest(t *testing.T, body []byte) *http.Request {
	t.Helper()
	v := hmacpkg.New(300)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", v.ComputeSignature(body, testSecret))
	req.Header.Set("X-Timestamp", strconv.FormatInt(time.Now().Unix(), 10))
	return req
}

// --- #1 Authentication --------------------------------------------------------

func TestExecute_RejectsUnauthenticated(t *testing.T) {
	t.Setenv("WEBHOOK_HMAC_DISABLED", "false")
	body, _ := json.Marshal(map[string]any{"script": "echo hi"})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	testRouter().ServeHTTP(rr, req)

	if rr.Code == http.StatusOK {
		t.Fatalf("unauthenticated request was accepted (200); expected rejection")
	}
}

func TestExecute_RejectsInvalidSignature(t *testing.T) {
	t.Setenv("WEBHOOK_HMAC_DISABLED", "false")
	body, _ := json.Marshal(map[string]any{"script": "echo hi"})

	req := httptest.NewRequest(http.MethodPost, "/api/v1/execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", "sha256=deadbeef")
	req.Header.Set("X-Timestamp", strconv.FormatInt(time.Now().Unix(), 10))
	rr := httptest.NewRecorder()
	testRouter().ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("invalid signature: got %d, want 401", rr.Code)
	}
}

func TestExecute_AcceptsValidSignature(t *testing.T) {
	t.Setenv("WEBHOOK_HMAC_DISABLED", "false")
	body, _ := json.Marshal(map[string]any{
		"script":         "echo hi",
		"execution_id":   "test-auth-ok",
		"timeout_seconds": 30,
	})

	rr := httptest.NewRecorder()
	testRouter().ServeHTTP(rr, signedExecuteRequest(t, body))

	if rr.Code != http.StatusOK {
		t.Fatalf("valid signed request: got %d, want 200; body=%s", rr.Code, rr.Body.String())
	}
}

// --- #2 / #5 Validation surfaced as 400 ---------------------------------------

func TestExecute_DisallowedCommandIs400(t *testing.T) {
	t.Setenv("WEBHOOK_HMAC_DISABLED", "false")
	body, _ := json.Marshal(map[string]any{
		"script":       "curlx http://evil",
		"execution_id": "test-bad-cmd",
	})

	rr := httptest.NewRecorder()
	testRouter().ServeHTTP(rr, signedExecuteRequest(t, body))

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("disallowed command: got %d, want 400; body=%s", rr.Code, rr.Body.String())
	}
}

func TestExecute_AbsoluteWorkingDirIs400(t *testing.T) {
	t.Setenv("WEBHOOK_HMAC_DISABLED", "false")
	body, _ := json.Marshal(map[string]any{
		"script":       "echo hi",
		"working_dir":  "/etc",
		"execution_id": "test-bad-wd",
	})

	rr := httptest.NewRecorder()
	testRouter().ServeHTTP(rr, signedExecuteRequest(t, body))

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("absolute working_dir: got %d, want 400; body=%s", rr.Code, rr.Body.String())
	}
}

func TestHealth_NoAuthRequired(t *testing.T) {
	t.Setenv("WEBHOOK_HMAC_DISABLED", "false")
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	rr := httptest.NewRecorder()
	testRouter().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("health: got %d, want 200", rr.Code)
	}
}
