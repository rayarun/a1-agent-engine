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
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// sandboxRoot is the only directory tree under which scripts are allowed to run.
const sandboxRoot = "/tmp/sandbox"

// allowedEnvVars is the explicit allowlist of host environment variables forwarded
// to untrusted scripts. Everything else (secrets, credentials, internal config) is
// scrubbed. Callers needing extra variables must pass them via req.Environment.
var allowedEnvVars = []string{"PATH", "HOME", "LANG", "LC_ALL", "TZ", "TERM"}

// allowedCommands is the allowlist of binaries an untrusted script may invoke.
// Deliberately excludes shells (sh/bash/eval/exec/source) so scripts cannot escape
// the allowlist via recursive interpretation. Override with BASH_ALLOWED_COMMANDS
// (comma-separated) to replace this default.
var defaultAllowedCommands = []string{
	"echo", "printf", "cat", "ls", "pwd", "cd", "grep", "egrep", "fgrep",
	"awk", "sed", "cut", "sort", "uniq", "head", "tail", "wc", "tr", "find",
	"date", "env", "true", "false", "test", "expr", "basename", "dirname",
	"jq", "ps", "df", "du", "uname", "whoami", "id", "hostname", "sleep",
	"xargs", "tee", "diff", "touch", "mkdir", "cp", "mv", "rm", "which",
	"seq", "tac", "comm", "join", "paste", "fold", "nl", "stat", "realpath",
	"readlink", "curl", "wget",
}

// shellKeywords are control-flow tokens that are not commands and need no allowlist entry.
var shellKeywords = map[string]bool{
	"if": true, "then": true, "else": true, "elif": true, "fi": true,
	"for": true, "while": true, "until": true, "do": true, "done": true,
	"case": true, "esac": true, "in": true, "function": true, "return": true,
	"local": true, "export": true, "set": true, "unset": true, "read": true,
	"{": true, "}": true, "(": true, ")": true, "[": true, "[[": true,
	"time": true, "exit": true, "break": true, "continue": true, "shift": true,
}

// ExecuteRequest defines a bash execution request
type ExecuteRequest struct {
	Script      string            `json:"script"`
	TimeoutSec  int               `json:"timeout_seconds"`
	Environment map[string]string `json:"environment"`
	WorkingDir  string            `json:"working_dir"`
	ExecutionID string            `json:"execution_id"`
}

// ExecuteResult is returned after execution completes
type ExecuteResult struct {
	ExitCode    int       `json:"exit_code"`
	Stdout      string    `json:"stdout"`
	Stderr      string    `json:"stderr"`
	DurationMs  int64     `json:"duration_ms"`
	Error       string    `json:"error,omitempty"`
	Truncated   bool      `json:"truncated"`
	TruncatedAt int       `json:"truncated_at,omitempty"`
}

// BashExecutor handles bash script execution with resource limits
type BashExecutor struct {
	MaxMemoryMB       int
	MaxCPUCores       int
	MaxTimeoutSeconds int
	MaxOutputBytes    int
}

// Execute runs a bash script with isolation and resource limits
func (e *BashExecutor) Execute(ctx context.Context, req *ExecuteRequest) (*ExecuteResult, error) {
	startTime := time.Now()
	result := &ExecuteResult{}

	// Enforce the command allowlist at the execution boundary so that any caller
	// (not just the HTTP handler) is subject to validation.
	if err := ValidateScript(req.Script); err != nil {
		return nil, err
	}

	// Resolve and confine the working directory under the sandbox root.
	workDir, cleanupDir, err := e.resolveWorkDir(req)
	if err != nil {
		return nil, err
	}
	defer os.RemoveAll(cleanupDir)

	// Apply resource limits (rlimit) and safety flags, then the user script.
	effectiveTimeout := req.TimeoutSec
	if effectiveTimeout <= 0 {
		effectiveTimeout = e.MaxTimeoutSeconds
	}
	script := e.buildScript(req.Script, effectiveTimeout)

	// Create command with context for timeout
	cmd := exec.CommandContext(ctx, "bash", "-c", script)
	cmd.Dir = workDir

	// Set a scrubbed environment: explicit host allowlist plus request-supplied vars only.
	cmd.Env = e.buildEnv(req.Environment)

	// Capture stdout/stderr
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Execute
	err = cmd.Run()

	// Collect output
	stdoutStr := stdout.String()
	stderrStr := stderr.String()

	// Check output size limits
	if len(stdoutStr) > e.MaxOutputBytes {
		stdoutStr = stdoutStr[:e.MaxOutputBytes]
		result.Truncated = true
		result.TruncatedAt = e.MaxOutputBytes
	}

	result.Stdout = stdoutStr
	result.Stderr = stderrStr
	result.DurationMs = time.Since(startTime).Milliseconds()

	// Capture exit code
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else if ctx.Err() == context.DeadlineExceeded {
			result.ExitCode = 124 // Standard timeout exit code
			result.Error = "execution timeout"
		} else {
			result.ExitCode = 1
			result.Error = err.Error()
		}
	} else {
		result.ExitCode = 0
	}

	return result, nil
}

// resolveWorkDir returns the (confined) working directory to run in and the directory
// to remove afterwards. The script always runs under sandboxRoot/<execution_id>; a
// request-supplied WorkingDir may only be a relative subpath that stays inside it.
func (e *BashExecutor) resolveWorkDir(req *ExecuteRequest) (workDir, cleanupDir string, err error) {
	execID := req.ExecutionID
	if execID == "" {
		execID = fmt.Sprintf("exec-%d", time.Now().UnixNano())
	}
	if err := ValidateExecutionID(execID); err != nil {
		return "", "", err
	}

	base := filepath.Join(sandboxRoot, execID)
	workDir = base

	if req.WorkingDir != "" {
		if err := ValidateWorkingDir(req.WorkingDir); err != nil {
			return "", "", err
		}
		candidate := filepath.Join(base, req.WorkingDir)
		rel, relErr := filepath.Rel(base, candidate)
		if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			return "", "", fmt.Errorf("working_dir escapes the sandbox: %q", req.WorkingDir)
		}
		workDir = candidate
	}

	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return "", "", fmt.Errorf("failed to create working directory: %w", err)
	}
	return workDir, base, nil
}

// buildEnv constructs the child process environment from the host allowlist plus the
// request-supplied variables. Host secrets that are not in the allowlist are dropped.
func (e *BashExecutor) buildEnv(reqEnv map[string]string) []string {
	env := make([]string, 0, len(allowedEnvVars)+len(reqEnv))
	for _, key := range allowedEnvVars {
		if v, ok := os.LookupEnv(key); ok {
			env = append(env, key+"="+v)
		}
	}
	for k, v := range reqEnv {
		env = append(env, fmt.Sprintf("%s=%s", k, v))
	}
	return env
}

// buildScript prepends rlimit enforcement (ulimit) and safety flags to the user script.
// ulimit -v caps address space (RLIMIT_AS); ulimit -t caps total CPU seconds
// (RLIMIT_CPU) at cores × wall timeout. Both are best-effort: platforms that do not
// support a limit (e.g. macOS ulimit -v) ignore it, while Linux containers enforce it.
func (e *BashExecutor) buildScript(userScript string, cpuTimeoutSec int) string {
	var b strings.Builder
	if e.MaxMemoryMB > 0 {
		fmt.Fprintf(&b, "ulimit -v %d 2>/dev/null || true\n", e.MaxMemoryMB*1024)
	}
	if e.MaxCPUCores > 0 && cpuTimeoutSec > 0 {
		fmt.Fprintf(&b, "ulimit -t %d 2>/dev/null || true\n", e.MaxCPUCores*cpuTimeoutSec)
	}
	b.WriteString("set -e -o pipefail\n")
	b.WriteString(userScript)
	return b.String()
}

// ValidateExecutionID rejects IDs that could be used to escape the sandbox root,
// since the ID is interpolated into the working-directory path.
func ValidateExecutionID(id string) error {
	if strings.ContainsAny(id, `/\`) || strings.Contains(id, "..") {
		return fmt.Errorf("invalid execution_id %q: must not contain path separators or '..'", id)
	}
	return nil
}

// ValidateWorkingDir rejects absolute paths and parent-directory traversal. An empty
// value is valid and means "use the sandbox root".
func ValidateWorkingDir(dir string) error {
	if dir == "" {
		return nil
	}
	if filepath.IsAbs(dir) {
		return fmt.Errorf("working_dir must be relative to the sandbox, got absolute path %q", dir)
	}
	clean := filepath.Clean(dir)
	if clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) {
		return fmt.Errorf("working_dir must not escape the sandbox: %q", dir)
	}
	return nil
}

// ValidateScript enforces a command allowlist over the script. Only binaries in the
// allowlist may be invoked, and command substitution (which would hide commands from
// this static check) is rejected. This is a defense-in-depth layer on top of env
// scrubbing, sandbox confinement, and rlimits — not a complete shell sandbox.
func ValidateScript(script string) error {
	if strings.TrimSpace(script) == "" {
		return fmt.Errorf("script is empty")
	}
	if strings.Contains(script, "$(") || strings.Contains(script, "`") {
		return fmt.Errorf("command substitution is not allowed")
	}

	allowed := allowedCommandSet()
	for _, cmd := range extractCommands(script) {
		if !allowed[cmd] {
			return fmt.Errorf("command not in allowlist: %q", cmd)
		}
	}
	return nil
}

// allowedCommandSet returns the active command allowlist, honoring the
// BASH_ALLOWED_COMMANDS override when set.
func allowedCommandSet() map[string]bool {
	list := defaultAllowedCommands
	if override := os.Getenv("BASH_ALLOWED_COMMANDS"); override != "" {
		list = strings.Split(override, ",")
	}
	set := make(map[string]bool, len(list))
	for _, c := range list {
		if c = strings.TrimSpace(c); c != "" {
			set[c] = true
		}
	}
	return set
}

// extractCommands returns the leading binary of each command in the script. It splits
// on shell separators, strips variable-assignment prefixes and redirections, and skips
// comments and control-flow keywords.
func extractCommands(script string) []string {
	normalized := strings.NewReplacer(";", "\n", "|", "\n", "&", "\n").Replace(script)
	var cmds []string
	for _, rawLine := range strings.Split(normalized, "\n") {
		line := strings.TrimSpace(rawLine)
		line = strings.TrimLeft(line, "({[ \t")
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		tok := fields[0]

		// Skip leading VAR=value assignments; the command (if any) follows.
		if eq := strings.Index(tok, "="); eq > 0 && !strings.ContainsAny(tok[:eq], "/.") {
			if len(fields) < 2 {
				continue
			}
			tok = fields[1]
		}

		// Skip redirections.
		if strings.HasPrefix(tok, ">") || strings.HasPrefix(tok, "<") {
			continue
		}

		tok = filepath.Base(tok)
		if shellKeywords[tok] {
			continue
		}
		cmds = append(cmds, tok)
	}
	return cmds
}
