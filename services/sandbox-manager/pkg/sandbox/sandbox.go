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

// Executor handles the execution of code in isolated containers.
type Executor struct {
	cli *client.Client
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
	img := "python:3.10-slim"

	// 1. Ensure image is present
	reader, err := e.cli.ImagePull(ctx, img, image.PullOptions{})
	if err != nil {
		return "", fmt.Errorf("failed to pull image: %w", err)
	}
	io.Copy(io.Discard, reader)
	reader.Close()

	// 2. Create container
	resp, err := e.cli.ContainerCreate(ctx, &container.Config{
		Image: img,
		Cmd:   []string{"python", "-c", code},
		Tty:   false,
	}, nil, nil, nil, "")
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
