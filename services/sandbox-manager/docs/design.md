# Sandbox Manager Design

## Overview
The Sandbox Manager provides a secure, isolated execution environment for untrusted agent code.

## Architecture
- **Technology**: Go 1.25.4 (net/http + Moby/Docker SDK)
- **Primary Role**: Lifecycle management of ephemeral executor containers.
- **Endpoint**: `POST /api/v1/execute`

## Security Model
- **Isolation**: Each code block runs in a fresh, unprivileged container with no network access (except where explicitly allowed).
- **Socket Access**: The Sandbox Manager has read/write access to the host's `/var/run/docker.sock`, but this access is NOT shared with the worker containers.
- **Time-to-Live**: Containers are automatically removed after execution or timeout.
