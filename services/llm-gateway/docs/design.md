# LLM Gateway Design

## Overview
The LLM Gateway is a centralized proxy that provides model-agnostic inference and embeddings to the entire platform.

## Architecture
- **Technology**: Go 1.25.4 (net/http + go-openai SDK)
- **Primary Role**: Unified interface for Chat Completions and Vector Embeddings.
- **Endpoints**:
    - `POST /v1/chat/completions`: Proxies to OpenAI or uses mock logic.
    - `POST /v1/embeddings`: Generates 1536-dimensional vectors for memory.
    - `GET /health`: Health check.

## Inference Logic
1. If an `OPENAI_API_KEY` is present, it proxies requests to the official OpenAI API.
2. If no key is present, it uses an internal **Mock Provider**:
    - Detects "trigger" keywords (math, calculation) and returns `tool_calls`.
    - Generates deterministic mock embedding vectors for testing.
