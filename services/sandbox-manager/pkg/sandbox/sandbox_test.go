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

package sandbox

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// These tests pin the security hardening applied to every sandbox container.
// They run without a Docker daemon because the config builders are pure.

func TestBuildContainerConfig_RunsAsNonRoot(t *testing.T) {
	cfg := buildContainerConfig("print('hi')")

	require.NotNil(t, cfg)
	assert.NotEmpty(t, cfg.User, "sandbox must declare an explicit non-root user")
	assert.NotEqual(t, "root", cfg.User)
	assert.NotEqual(t, "0", cfg.User)
	assert.NotEqual(t, "0:0", cfg.User)
}

func TestBuildContainerConfig_PassesCodeUnmodified(t *testing.T) {
	code := "import sys; print(sys.version)"
	cfg := buildContainerConfig(code)

	assert.Equal(t, []string{"python", "-c", code}, []string(cfg.Cmd))
	assert.False(t, cfg.Tty)
}

func TestBuildContainerConfig_UsesSupportedImage(t *testing.T) {
	cfg := buildContainerConfig("print(1)")

	// python:3.10 is EOL; the sandbox must track a supported release.
	assert.False(t, strings.HasPrefix(cfg.Image, "python:3.10"),
		"base image must not be the EOL python:3.10 line")
	assert.True(t, strings.HasPrefix(cfg.Image, "python:3."))
}

func TestBuildHostConfig_ResourceLimits(t *testing.T) {
	hc := buildHostConfig()
	require.NotNil(t, hc)

	assert.Positive(t, hc.Memory, "memory limit must be set")
	assert.Positive(t, hc.NanoCPUs, "CPU limit must be set")

	require.NotNil(t, hc.PidsLimit, "PID limit must be set to prevent fork bombs")
	assert.Positive(t, *hc.PidsLimit)
}

func TestBuildHostConfig_NetworkIsolated(t *testing.T) {
	hc := buildHostConfig()

	// "none" prevents the sandbox reaching internal services or the cloud
	// metadata endpoint (SSRF / credential theft).
	assert.Equal(t, "none", string(hc.NetworkMode))
}

func TestBuildHostConfig_FilesystemAndCapabilities(t *testing.T) {
	hc := buildHostConfig()

	assert.True(t, hc.ReadonlyRootfs, "root filesystem must be read-only")
	assert.Contains(t, []string(hc.CapDrop), "ALL", "all Linux capabilities must be dropped")
}

func TestBuildHostConfig_NoNewPrivileges(t *testing.T) {
	hc := buildHostConfig()

	// Blocks setuid-based privilege escalation; a pragmatic stand-in for a
	// bespoke seccomp/AppArmor profile.
	assert.Contains(t, hc.SecurityOpt, "no-new-privileges")
}

func TestBuildHostConfig_WritableTmpIsConstrained(t *testing.T) {
	hc := buildHostConfig()

	// A read-only rootfs needs a scratch space; it must be non-exec, non-suid
	// and size-bounded so it can't be abused.
	opts, ok := hc.Tmpfs["/tmp"]
	require.True(t, ok, "/tmp scratch space must be provided for a read-only rootfs")
	assert.Contains(t, opts, "noexec")
	assert.Contains(t, opts, "nosuid")
	assert.Contains(t, opts, "size=")
}
