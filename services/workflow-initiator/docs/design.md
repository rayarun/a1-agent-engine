# Workflow Initiator Design Document

## Overview
The Workflow Initiator service is the bridge between the platform's API layer and the Temporal orchestration engine. It is responsible for translating agent task requests into durable Temporal workflows.

## Architecture
Built in Golang, it serves as a high-throughput dispatcher. It receives agent identifiers and payloads, fetches the corresponding YAML manifests from the registry, and submits a start request to the Temporal cluster.

### Key Interactions
- **API Gateway**: Receives task submission requests.
- **Agent Registry (Postgres)**: Fetches agent manifests and configurations.
- **Temporal Cluster**: Dispatches work items to the orchestrator.
- **Observability Stack**: Traces the handoff from API request to background workflow.

## Key Features
- **Manifest Translation**: Parses YAML agent manifests and applies logic to configure Temporal workflow options (timeouts, retries).
- **Idempotency Management**: Ensures that duplicate task requests (using session IDs) do not spawn redundant workflows.
- **Workflow Life-Cycle Management**: Provides APIs to query workflow status, send signals (for HITL), or cancel executions.

## Technical Stack
- **Language**: Golang
- **Orchestration**: Temporal Go SDK
- **Persistence**: PostgreSQL (for manifest lookup)
- **ID Management**: UUID/Session-based idempotency.

## Current Status
- [x] Golang project structure initialized.
- [x] Basic health-check endpoint.
- [ ] Temporal Go SDK integration.
- [ ] Manifest parsing logic.
- [ ] Workflow submission and status APIs.
