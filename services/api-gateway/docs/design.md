# API Gateway Design Document

## Overview
The API Gateway is the edge entry point for the Agentic AI Platform. It handles inbound requests from external systems (webhooks) and the Agent Studio UI, performing authentication, authorization, and routing to internal services.

## Architecture
Built in Golang for high performance and low latency, the gateway acts as a security and policy enforcement layer before traffic enters the orchestration plane.

### Key Interactions
- **Agent Studio**: Receives administrative and operational requests.
- **Webhook Sources**: Receives event-driven triggers.
- **Workflow Initiator**: Proxies agent task requests to the initiator for Temporal submission.
- **OIDC Provider**: Validates user and machine identities.

## Key Features
- **AuthN/AuthZ**: Integrates with OIDC/SAML for identity verification and enforces RBAC policies.
- **Rate Limiting**: Protects downstream services from surges, managed via Redis.
- **Request Normalization**: Maps diverse webhook payloads (e.g., Datadog, GitHub) into standard platform events.
- **Observability**: Instruments all inbound traffic with OpenTelemetry traces.

## Technical Stack
- **Language**: Golang
- **Framework**: Standard `net/http` (or Gin/Echo for more complex routing)
- **Persistence**: Redis (for rate limiting and session caching)
- **Observability**: OpenTelemetry Go SDK

## Current Status
- [x] Golang project structure initialized.
- [x] Basic health-check endpoint.
- [ ] Authentication middleware (OIDC).
- [ ] Rate limiting implementation.
- [ ] Routes for agent triggering and status.
