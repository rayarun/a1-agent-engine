# Agent Workers Design Document

## Overview
Agent Workers are the primary compute nodes responsible for executing AI agent reasoning loops (ReAct). They are built as Temporal workers to ensure durable execution and resilience against hardware failures or transient errors.

## Architecture
The workers run the OpenAI Agents SDK inside Temporal workflows. This allows an agent's state (reasoning trace, memory) to be persisted across retries and restarts.

### Key Components
- **Temporal Workflow**: Orchestrates the reasoning loop and handles signals (e.g., Human-in-the-loop approvals).
- **OpenAI Agents SDK**: Provides the framework for agentic behavior, tool definitions, and handoffs.
- **Activities**: External calls (LLM, tool execution, memory retrieval) are wrapped as Temporal activities for automatic retries.

### Interactions
- **Temporal Cluster**: Listens to task queues for work items.
- **LLM Gateway**: Proxies all inference requests to external or local models.
- **Sandbox Manager**: Executes untrusted code or scripts in isolated environments.
- **Context Hydrator**: Injects relevant RAG context and SOPs into the prompt.

## Key Features
- **Durable ReAct Loops**: Guaranteed execution state via Temporal.
- **Human-In-The-Loop (HITL)**: Native support for pausing execution awaiting manual signals.
- **Auto-Retry & Fallback**: Intelligent handling of API rate limits and model failures.
- **Distributed Scaling**: Horizontally scales based on Temporal queue depth.

## Technical Stack
- **Language**: Python 3.x
- **Orchestration**: Temporal Python SDK
- **AI SDK**: OpenAI Agents SDK
- **Inference**: LiteLLM (via LLM Gateway)

## Current Status
- [x] Python project structure initialized.
- [x] Basic Temporal workflow skeleton (`workflows.py`).
- [ ] Integration with OpenAI Agents SDK.
- [ ] Activity implementation for LLM/Tools.
- [ ] HITL signal handling.
