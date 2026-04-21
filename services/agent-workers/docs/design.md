# Agent Workers Design

## Overview
Agent Workers are the execution engine of the platform. They run long-lived, durable workflows that orchestrate LLM reasoning and tool usage.

## Architecture
- **Technology**: Python 3.10+ (Temporal Python SDK)
- **Primary Role**: Orchestrate the ReAct (Reasoning + Action) loop.

## The ReAct Loop (Durable)
1. **Recall**: Search `agent_memories` via `llm-gateway` and `pgvector`.
2. **Context**: Inject memories into the system prompt.
3. **Loop**:
   - Query `llm-gateway` with the current conversation history.
   - If `tool_calls` are emitted:
     - Execute the `execute_code` activity (via `sandbox-manager`).
     - Feed the observation back into the LLM.
   - Repeat until a final answer is produced.
4. **Learn**: Summarize the finding and call `store_memory`.

## Persistence
All loop logic is encapsulated in a Temporal Workflow, ensuring that if a worker crashes, the reasoning state is persisted and resumed exactly where it left off.
