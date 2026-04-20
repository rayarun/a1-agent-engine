# Go Shared Package Design Document

## Overview
`go-shared` is a collection of reusable Go libraries and utilities used across all Golang-based microservices in the Agentic AI Platform (e.g., API Gateway, Workflow Initiator, Sandbox Manager).

## Architecture
It is structured as a Go module that can be imported by other services in the monorepo. It focuses on cross-cutting concerns like observability, logging, security, and common data structures.

### Modules within Package
- **`pkg/logging`**: Wrapper around standard loggers with structured output (JSON) for OTel compatibility.
- **`pkg/otel`**: Initialization and helper functions for OpenTelemetry tracing and metrics.
- **`pkg/auth`**: Shared middleware and validation logic for OIDC/SAML tokens.
- **`pkg/models`**: Common Protobuf-generated structures or shared DTOs used across service boundaries.
- **`pkg/errors`**: Standardized error handling and reporting utilities.

## Key Features
- **Consistency**: Ensures all Go services use the same logging and tracing formats.
- **Centralization**: Reduces code duplication for boilerplate tasks like auth validation or health-check reporting.
- **Type Safety**: Provides a single source of truth for shared data models.

## Technical Stack
- **Language**: Golang
- **Dependencies**: OpenTelemetry Go SDK, ProtoBuf, various Go auth libraries.

## Current Status
- [ ] Go module initialization (`go.mod`).
- [ ] Core logging library.
- [ ] OpenTelemetry initialization helpers.
- [ ] Shared DTO definitions.
