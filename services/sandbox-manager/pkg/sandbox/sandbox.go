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
	"bytes"
	"context"
	"fmt"
	"io"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"github.com/docker/docker/pkg/stdcopy"
)

// Sandbox hardening parameters. These are deliberately conservative: agent-
// supplied code is untrusted, so the container is locked down to a minimal,
// resource-capped, network-isolated, non-root, read-only environment.
const (
	sandboxImage     = "python:3.13-slim" // 3.10 is EOL; track a supported release
	sandboxUser      = "65534:65534"      // nobody:nogroup — never run as root
	sandboxMemBytes  = 256 * 1024 * 1024  // 256 MiB hard memory cap
	sandboxNanoCPUs  = 1_000_000_000      // 1.0 CPU (1e9 nano-CPUs)
	sandboxPidsLimit = 128                // cap processes to stop fork bombs
	sandboxTmpfsOpts = "rw,noexec,nosuid,size=64m"
)

// Executor handles the execution of code in isolated containers.
type Executor struct {
	cli *client.Client
}

// buildContainerConfig builds the container.Config for a sandbox run. Kept pure
// (no Docker calls) so the security posture can be unit-tested.
func buildContainerConfig(code string) *container.Config {
	return &container.Config{
		Image: sandboxImage,
		Cmd:   []string{"python", "-c", code},
		Tty:   false,
		User:  sandboxUser,
	}
}

// buildHostConfig builds the container.HostConfig that enforces resource limits
// and isolation. Kept pure so the security posture can be unit-tested.
func buildHostConfig() *container.HostConfig {
	pids := int64(sandboxPidsLimit)
	return &container.HostConfig{
		// No network: the sandbox cannot reach internal services or the cloud
		// metadata endpoint (mitigates SSRF / credential theft).
		NetworkMode:    "none",
		ReadonlyRootfs: true,
		CapDrop:        []string{"ALL"},
		// no-new-privileges blocks setuid-based escalation; pragmatic stand-in
		// for a bespoke seccomp/AppArmor profile.
		SecurityOpt: []string{"no-new-privileges"},
		// Read-only rootfs still needs scratch space; keep it non-exec and bounded.
		Tmpfs: map[string]string{
			"/tmp": sandboxTmpfsOpts,
		},
		Resources: container.Resources{
			Memory:    sandboxMemBytes,
			NanoCPUs:  sandboxNanoCPUs,
			PidsLimit: &pids,
		},
	}
}

// NewExecutor creates a new Docker-based executor.
func NewExecutor() (*Executor, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &Executor{cli: cli}, nil
}

// ExecutePython executes an arbitrary Python string in a sandbox.
func (e *Executor) ExecutePython(ctx context.Context, code string) (string, error) {
	// 1. Ensure image is present
	reader, err := e.cli.ImagePull(ctx, sandboxImage, image.PullOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to pull image: %w", err)
	}
	io.Copy(io.Discard, reader)
	reader.Close()

	// 2. Create container with hardened resource limits and isolation
	resp, err := e.cli.ContainerCreate(ctx, buildContainerConfig(code), buildHostConfig(), nil, nil, "")
	if err != nil {
		return "", fmt.Errorf("failed to create container: %w", err)
	}

	defer e.cli.ContainerRemove(ctx, resp.ID, container.RemoveOptions{Force: true})

	// 3. Start container
	if err := e.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return "", fmt.Errorf("failed to start container: %w", err)
	}

	// 4. Wait for completion
	statusCh, errCh := e.cli.ContainerWait(ctx, resp.ID, container.WaitConditionNotRunning)
	select {
	case err := <-errCh:
		if err != nil {
			return "", err
		}
	case <-statusCh:
	}

	// 5. Get logs
	out, err := e.cli.ContainerLogs(ctx, resp.ID, container.LogsOptions{ShowStdout: true, ShowStderr: true})
	if err != nil {
		return "", err
	}
	defer out.Close()

	// Capture output
	var stdoutBuf, stderrBuf bytes.Buffer
	_, err = stdcopy.StdCopy(&stdoutBuf, &stderrBuf, out)
	if err != nil {
		return "", fmt.Errorf("failed to copy logs: %w", err)
	}

	result := stdoutBuf.String()
	if stderrBuf.Len() > 0 {
		result += "\nErrors:\n" + stderrBuf.String()
	}

	return result, nil
}
