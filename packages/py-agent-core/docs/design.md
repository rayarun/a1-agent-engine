# Python Agent Core Package Design Document

## Overview
`py-agent-core` is the foundational Python library for building and running AI agents within the platform. It provides the core abstractions and utilities required by the `agent-workers`.

## Architecture
It is designed as a standalone Python package (managed via `poetry` or `pip`) that encapsulates the interaction with the OpenAI Agents SDK and the platform's orchestration layer.

### Modules within Package
- **`core.agent`**: Base classes and decorators for defining agents and their personas.
- **`core.skills`**: Utilities for wrapping internal/external APIs as reusable agent skills.
- **`core.temporal`**: Helper functions for ensuring agent logic is compatible with Temporal's non-determinism constraints.
- **`core.context`**: Logic for interacting with the Context Hydrator and injecting RAG data into agent memory.
- **`core.telemetry`**: Integration with OpenTelemetry for logging agent reasoning traces and token metrics.

## Key Features
- **SDK Wrapper**: Standardizes how the OpenAI Agents SDK is used within the enterprise environment.
- **Skill SDK**: Simplifies the process of creating new skills with automatic schema generation for the LLM.
- **Memory Management**: Core logic for handling short-term and long-term agent memory.

## Technical Stack
- **Language**: Python 3.x
- **Core Library**: OpenAI Agents SDK
- **Observability**: OpenTelemetry Python SDK
- **Serialization**: Pydantic (for schema validation)

## Current Status
- [ ] Python package initialization (`pyproject.toml`).
- [ ] Basic agent abstraction layer.
- [ ] Integration helpers for OpenAI SDK.
- [ ] Telemetry instrumentation.
