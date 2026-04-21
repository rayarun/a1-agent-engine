# Workflow Initiator Design

## Overview
The Workflow Initiator is a bridge between the RESTful API world and the durable orchestration world of Temporal.

## Architecture
- **Technology**: Go 1.25.4 (net/http + Temporal Go SDK)
- **Primary Role**: Workflow dispatcher and session manager.
- **Endpoints**:
    - `POST /api/v1/sessions`: Starts a new Temporal `AgentWorkflow`.
    - `GET /api/v1/sessions/{id}`: High-level query for workflow status/result.

## Technical Details
- **Temporal Client**: Uses a shared connection to the Temporal frontend.
- **Session ID Mapping**: Translates platform-level session IDs into unique Temporal Workflow IDs.
- **Result Retrieval**: Blocks on the Temporal workflow handle to retrieve results for the Status API.
