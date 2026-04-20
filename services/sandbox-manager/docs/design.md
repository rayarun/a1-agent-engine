# Sandbox Manager Design Document

## Overview
The Sandbox Manager is a critical security component that provides isolated execution environments for untrusted code or scripts. It ensures that agent tools can execute arbitrary logic without compromising the host system or legal internal network.

## Architecture
Built as a Go microservice, it manages a pool of ephemeral Docker containers. It exposes an internal API for providing a sandbox, executing code within it, and cleaning up afterwards.

### Key Interactions
- **Agent Workers**: Request execution of tool logic within a sandbox.
- **Docker Engine**: Used to spawn and manage container lifecycles.
- **Observability Stack**: Reports execution logs and resource usage.

## Key Features
- **Strict Isolation**: Uses Docker containers with restricted egress and no root privileges.
- **JIT Provisioning**: Spawns short-lived environments on-demand.
- **Resource Limiting**: Enforces CPU and memory constraints on sandboxed processes.
- **Clean Tear-down**: Automatically destroys environments post-execution to prevent state leak.

## Technical Stack
- **Language**: Golang
- **Containerization**: Docker (via Docker Engine API)
- **Networking**: Isolated VPC subnets with restricted egress.

## Current Status
- [ ] Golang project structure initialization.
- [ ] Docker Engine API integration.
- [ ] Sandbox provisioning logic.
- [ ] Execution and log streaming.
