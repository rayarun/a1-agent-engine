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

package executor

import (
	"context"
	"os"
	"strings"
	"testing"
)

func newTestExecutor() *BashExecutor {
	return &BashExecutor{
		MaxMemoryMB:       256,
		MaxCPUCores:       2,
		MaxTimeoutSeconds: 300,
		MaxOutputBytes:    64 * 1024,
	}
}

// --- #3 Environment scrubbing -------------------------------------------------

func TestBuildEnv_ScrubsHostSecrets(t *testing.T) {
	const secretKey = "BASHEXEC_TEST_SECRET"
	const secretVal = "topsecret-should-not-leak"
	t.Setenv(secretKey, secretVal)

	e := newTestExecutor()
	env := e.buildEnv(map[string]string{"FOO": "bar"})

	for _, kv := range env {
		if strings.Contains(kv, secretKey) || strings.Contains(kv, secretVal) {
			t.Fatalf("host secret leaked into child env: %q", kv)
		}
	}

	if !containsKV(env, "FOO=bar") {
		t.Fatalf("request-supplied env var missing; got %v", env)
	}
	// PATH must be forwarded so binaries resolve.
	if !hasKey(env, "PATH") {
		t.Fatalf("PATH not forwarded to child env; got %v", env)
	}
}

func TestExecute_DoesNotLeakHostEnv(t *testing.T) {
	const secretKey = "BASHEXEC_LEAK_PROBE"
	t.Setenv(secretKey, "leaked-value-xyz")

	e := newTestExecutor()
	res, err := e.Execute(context.Background(), &ExecuteRequest{
		Script:      `echo "probe=[${BASHEXEC_LEAK_PROBE}]"`,
		TimeoutSec:  30,
		ExecutionID: "test-no-leak",
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if strings.Contains(res.Stdout, "leaked-value-xyz") {
		t.Fatalf("host env leaked into script output: %q", res.Stdout)
	}
	if !strings.Contains(res.Stdout, "probe=[]") {
		t.Fatalf("expected empty probe, got %q", res.Stdout)
	}
}

// --- #5 Working directory confinement -----------------------------------------

func TestExecute_RejectsAbsoluteWorkingDir(t *testing.T) {
	e := newTestExecutor()
	_, err := e.Execute(context.Background(), &ExecuteRequest{
		Script:      "echo hi",
		TimeoutSec:  30,
		WorkingDir:  "/etc",
		ExecutionID: "test-abs",
	})
	if err == nil {
		t.Fatal("expected error for absolute working_dir, got nil")
	}
}

func TestExecute_RejectsTraversalWorkingDir(t *testing.T) {
	e := newTestExecutor()
	_, err := e.Execute(context.Background(), &ExecuteRequest{
		Script:      "echo hi",
		TimeoutSec:  30,
		WorkingDir:  "../../../../etc",
		ExecutionID: "test-traversal",
	})
	if err == nil {
		t.Fatal("expected error for traversal working_dir, got nil")
	}
}

func TestExecute_RejectsTraversalExecutionID(t *testing.T) {
	e := newTestExecutor()
	_, err := e.Execute(context.Background(), &ExecuteRequest{
		Script:      "echo hi",
		TimeoutSec:  30,
		ExecutionID: "../../escape",
	})
	if err == nil {
		t.Fatal("expected error for traversal execution_id, got nil")
	}
}

func TestExecute_CleansUpSandbox(t *testing.T) {
	e := newTestExecutor()
	id := "test-cleanup-unique"
	_, err := e.Execute(context.Background(), &ExecuteRequest{
		Script:      "echo hi > marker.txt",
		TimeoutSec:  30,
		ExecutionID: id,
	})
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}
	if _, statErr := os.Stat("/tmp/sandbox/" + id); !os.IsNotExist(statErr) {
		t.Fatalf("sandbox dir was not cleaned up: stat err=%v", statErr)
	}
}

func TestValidateWorkingDir(t *testing.T) {
	cases := []struct {
		dir     string
		wantErr bool
	}{
		{"", false},
		{"work", false},
		{"a/b/c", false},
		{"/etc", true},
		{"/tmp/anything", true},
		{"..", true},
		{"../escape", true},
		{"a/../../escape", true},
	}
	for _, c := range cases {
		err := ValidateWorkingDir(c.dir)
		if (err != nil) != c.wantErr {
			t.Errorf("ValidateWorkingDir(%q) err=%v, wantErr=%v", c.dir, err, c.wantErr)
		}
	}
}

// --- #4 Resource limits enforced ----------------------------------------------

func TestBuildScript_AppliesResourceLimits(t *testing.T) {
	e := newTestExecutor() // 256 MB, 2 cores
	script := e.buildScript("echo hi", 100)

	if !strings.Contains(script, "ulimit -v 262144") { // 256 * 1024 KB
		t.Errorf("memory rlimit (ulimit -v) not applied; got:\n%s", script)
	}
	if !strings.Contains(script, "ulimit -t 200") { // 2 cores * 100s
		t.Errorf("cpu rlimit (ulimit -t) not applied; got:\n%s", script)
	}
	if !strings.Contains(script, "set -e -o pipefail") {
		t.Errorf("safety flags missing; got:\n%s", script)
	}
	if !strings.Contains(script, "echo hi") {
		t.Errorf("user script missing; got:\n%s", script)
	}
}

// Execute itself must enforce the allowlist, not only the HTTP handler, so that
// non-HTTP callers cannot bypass validation (defense at the trust boundary).
func TestExecute_RejectsDisallowedCommand(t *testing.T) {
	e := newTestExecutor()
	_, err := e.Execute(context.Background(), &ExecuteRequest{
		Script:      "curlx http://evil",
		TimeoutSec:  30,
		ExecutionID: "test-disallowed-cmd",
	})
	if err == nil {
		t.Fatal("expected Execute to reject disallowed command via ValidateScript")
	}
}

// --- #2 ValidateScript allowlist ----------------------------------------------

func TestValidateScript_Allowlist(t *testing.T) {
	cases := []struct {
		name    string
		script  string
		wantErr bool
	}{
		{"empty", "   ", true},
		{"allowed simple", "echo hello", false},
		{"allowed pipeline", "cat file | grep foo | wc -l", false},
		{"allowed multiline", "ls -la\ngrep x file\nawk '{print $1}' file", false},
		{"disallowed command", "curlx http://evil", true},
		{"disallowed bash recursion", "bash -c 'rm -rf /'", true},
		{"command substitution blocked", "echo $(whoami)", true},
		{"backtick blocked", "echo `id`", true},
		{"var assignment then allowed", "FOO=bar echo $FOO", false},
	}
	for _, c := range cases {
		err := ValidateScript(c.script)
		if (err != nil) != c.wantErr {
			t.Errorf("ValidateScript(%q) err=%v, wantErr=%v", c.script, err, c.wantErr)
		}
	}
}

// --- helpers ------------------------------------------------------------------

func containsKV(env []string, want string) bool {
	for _, kv := range env {
		if kv == want {
			return true
		}
	}
	return false
}

func hasKey(env []string, key string) bool {
	for _, kv := range env {
		if strings.HasPrefix(kv, key+"=") {
			return true
		}
	}
	return false
}
