# API Gateway Design

## Overview
The API Gateway is the central entry point for external clients (and the Dashboard). It provides a unified RESTful interface to trigger agents and monitor their progress.

## Architecture
- **Technology**: Go 1.25.4 (net/http)
- **Primary Role**: Proxy and orchestration layer.
- **Endpoints**:
    - `POST /api/v1/agents/{agent_id}/trigger`: Dispatches a request to the Workflow Initiator.
    - `GET /api/v1/sessions/{id}/status`: Polls for workflow results.
    - `GET /health`: Basic health check.

## Data Flow
1. Client sends a trigger request.
2. Gateway generates a session ID and calls the Workflow Initiator.
3. Gateway returns the Workflow ID immediately.
4. Dashboard/Client polls the status endpoint to retrieve the Temporal result.
