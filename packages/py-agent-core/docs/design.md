# py-agent-core: Design Document

## Overview

`py-agent-core` is the foundational Python package that isolates the rest of the platform from any specific agent framework. It defines a stable interface contract between the Temporal execution layer (`agent-workers`) and the active agent framework (currently Pydantic AI). Swapping the framework is an environment variable change and a single new adapter file — no changes to `workflows.py`, tools, or the LLM Gateway.

## The Problem It Solves

`agent-workers/workflows.py` is a Temporal `@workflow.defn` — it must be deterministic and cannot contain external I/O. Tool implementations are pure business logic. Neither should know or care whether the platform uses Pydantic AI, OpenAI Agents SDK, or any future framework.

Without `py-agent-core`, a framework change would require editing `workflows.py`, all `@activity.defn` functions, and every tool — touching the most sensitive parts of the platform. With `py-agent-core`, the framework is fully contained inside a single adapter class.

## Package Structure

```text
packages/py-agent-core/
├── pyproject.toml
├── py_agent_core/
│   ├── interfaces.py       # AgentRunner (ABC), PlatformTool (Protocol),
│   │                       #   PlatformContext, AgentResult — the stable contract
│   ├── factory.py          # create_runner() — reads AGENT_FRAMEWORK env var,
│   │                       #   imports and returns the active adapter
│   ├── manifest.py         # AgentManifest, ToolCall, TokenUsage — shared data models
│   ├── registry.py         # ToolRegistry — maps skill names to PlatformTool instances
│   ├── telemetry.py        # OTel span helpers for agent reasoning traces
│   └── adapters/
│       ├── pydantic_ai.py  # ACTIVE — PydanticAIRunner(AgentRunner)
│       └── openai_agents.py# FUTURE  — OpenAIAgentsRunner(AgentRunner)
└── docs/
    └── design.md
```

## Interface Contract (`interfaces.py`)

This is the only file `agent-workers` imports from. It never changes when swapping frameworks.

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Protocol, Literal, Any

@dataclass
class PlatformContext:
    agent_id: str
    session_id: str
    memories: list[str] = field(default_factory=list)
    trigger_source: Literal['chat', 'webhook', 'scheduled'] = 'chat'

@dataclass
class TokenUsage:
    input_tokens: int
    output_tokens: int

@dataclass
class ToolCall:
    tool_name: str
    arguments: dict
    result: str

@dataclass
class AgentResult:
    output: str
    tool_calls_made: list[ToolCall]
    usage: TokenUsage
    messages: list[dict]    # full message history → forwarded to OTel + Cost Attribution

class PlatformTool(Protocol):
    """
    Implement this Protocol to register a tool with the platform.
    No framework imports required — pure Python.
    """
    name: str
    description: str
    input_schema: dict      # JSON Schema for the tool's arguments

    async def execute(self, ctx: PlatformContext, **kwargs: Any) -> str: ...

class AgentRunner(ABC):
    """Abstract base — one concrete implementation per supported framework."""

    @classmethod
    @abstractmethod
    def from_manifest(cls,
                      manifest: 'AgentManifest',
                      tools: list[PlatformTool]) -> 'AgentRunner': ...

    @abstractmethod
    async def run(self, input: str, ctx: PlatformContext) -> AgentResult: ...
```

## Active Adapter: Pydantic AI (`adapters/pydantic_ai.py`)

Pydantic AI was chosen because:
- `agent.run()` is a plain async coroutine — wraps cleanly in a Temporal `@activity.defn`
- `RunContext[Deps]` dependency injection threads `PlatformContext` into every tool call without global state
- Typed `result_type` and `output_type` align with the platform's typed sub-agent I/O schema
- Provider-agnostic model selection via `"openai:<model>"` prefix routes through the LiteLLM Gateway without configuration changes
- No embedded execution loop or state machine that would conflict with Temporal

```python
# adapters/pydantic_ai.py
from pydantic_ai import Agent as _PydanticAgent, RunContext
from ..interfaces import AgentRunner, AgentResult, PlatformContext, PlatformTool, TokenUsage

class PydanticAIRunner(AgentRunner):

    def __init__(self, agent: _PydanticAgent):
        self._agent = agent

    @classmethod
    def from_manifest(cls, manifest, tools: list[PlatformTool]) -> 'PydanticAIRunner':
        pydantic_tools = [cls._adapt_tool(t) for t in tools]
        agent = _PydanticAgent(
            model=manifest.model,            # "openai:gpt-4o" → LiteLLM gateway
            system_prompt=manifest.system_prompt,
            tools=pydantic_tools,
            deps_type=PlatformContext,
            model_settings={'max_tokens': manifest.max_tokens},
        )
        return cls(agent)

    async def run(self, input: str, ctx: PlatformContext) -> AgentResult:
        result = await self._agent.run(input, deps=ctx)
        return AgentResult(
            output=str(result.data),
            tool_calls_made=_extract_tool_calls(result.all_messages()),
            usage=TokenUsage(
                input_tokens=result.usage().request_tokens or 0,
                output_tokens=result.usage().response_tokens or 0,
            ),
            messages=result.all_messages_json(),
        )

    @staticmethod
    def _adapt_tool(tool: PlatformTool):
        """
        Wraps a PlatformTool as a Pydantic AI tool function.
        RunContext threads PlatformContext in without changing tool signatures.
        """
        async def _fn(ctx: RunContext[PlatformContext], **kwargs) -> str:
            return await tool.execute(ctx.deps, **kwargs)

        _fn.__name__ = tool.name
        _fn.__doc__ = tool.description
        # Pydantic AI reads __annotations__ for schema — set from input_schema
        _fn.__annotations__ = _schema_to_annotations(tool.input_schema)
        return _fn
```

## Future Adapter: OpenAI Agents SDK (`adapters/openai_agents.py`)

Stubbed and ready. The swap requires:
1. `pip install openai-agents` in `pyproject.toml`
2. `AGENT_FRAMEWORK=openai_agents` in the deployment env
3. No changes outside this file

```python
# adapters/openai_agents.py  (future)
from agents import Agent as _OAIAgent, Runner, function_tool
from ..interfaces import AgentRunner, AgentResult, PlatformContext, PlatformTool, TokenUsage

class OpenAIAgentsRunner(AgentRunner):

    def __init__(self, agent: _OAIAgent):
        self._agent = agent

    @classmethod
    def from_manifest(cls, manifest, tools: list[PlatformTool]) -> 'OpenAIAgentsRunner':
        oai_tools = [cls._adapt_tool(t) for t in tools]
        agent = _OAIAgent(
            name=manifest.name,
            instructions=manifest.system_prompt,
            tools=oai_tools,
            model=manifest.model,
        )
        return cls(agent)

    async def run(self, input: str, ctx: PlatformContext) -> AgentResult:
        result = await Runner.run(self._agent, input)
        return AgentResult(
            output=result.final_output,
            tool_calls_made=_extract_tool_calls(result),
            usage=TokenUsage(input_tokens=0, output_tokens=0),   # fill from result metadata
            messages=[],
        )

    @staticmethod
    def _adapt_tool(tool: PlatformTool):
        @function_tool
        async def _fn(**kwargs) -> str:
            # NOTE: PlatformContext is not threaded here — OpenAI Agents SDK
            # does not have a RunContext equivalent. Pass required context
            # via closure or a request-scoped context var.
            return await tool.execute(**kwargs)
        _fn.__name__ = tool.name
        return _fn
```

> **Known gap**: Pydantic AI's `RunContext[Deps]` threads `PlatformContext` cleanly into every tool. OpenAI Agents SDK has no equivalent. The adapter can work around this via `contextvars.ContextVar` — set before `Runner.run()`, read in tools. This is documented in the adapter stub and is the only behavioral difference between the two adapters.

## Factory (`factory.py`)

The single location of the framework decision.

```python
import os
from .interfaces import AgentRunner, PlatformTool
from .manifest import AgentManifest

def create_runner(manifest: AgentManifest,
                  tools: list[PlatformTool]) -> AgentRunner:
    framework = os.getenv("AGENT_FRAMEWORK", "pydantic_ai")

    if framework == "pydantic_ai":
        from .adapters.pydantic_ai import PydanticAIRunner
        return PydanticAIRunner.from_manifest(manifest, tools)

    if framework == "openai_agents":
        from .adapters.openai_agents import OpenAIAgentsRunner
        return OpenAIAgentsRunner.from_manifest(manifest, tools)

    raise ValueError(
        f"Unknown AGENT_FRAMEWORK='{framework}'. "
        f"Valid values: 'pydantic_ai', 'openai_agents'"
    )
```

Adapters are imported lazily inside each branch. A deployment running `pydantic_ai` never loads `openai-agents` at process start.

## How `agent-workers` Consumes This Package

`agent-workers` has one import rule: **only import from `py_agent_core`**.

```python
# services/agent-workers/activities_agent.py
from py_agent_core.factory import create_runner
from py_agent_core.interfaces import PlatformContext
from py_agent_core.registry import ToolRegistry
from py_agent_core.manifest import AgentManifest

@activity.defn
async def reasoning_step(
    manifest: dict,
    input: str,
    memories: list[str],
    trigger_source: str,
) -> dict:
    agent_manifest = AgentManifest(**manifest)
    tools = ToolRegistry.resolve(agent_manifest.allowed_skills)
    ctx = PlatformContext(
        agent_id=agent_manifest.agent_id,
        memories=memories,
        trigger_source=trigger_source,
    )
    runner = create_runner(agent_manifest, tools)
    result = await runner.run(input, ctx)
    return result.model_dump()
```

`workflows.py` calls `reasoning_step` as a Temporal activity — it has no knowledge of Pydantic AI or any framework.

## Writing a Tool (PlatformTool)

Tool authors implement the `PlatformTool` protocol. No framework imports, no decorators. The adapter handles framework-specific wrapping.

```python
# Example: a cost explorer tool
from py_agent_core.interfaces import PlatformTool, PlatformContext

class AWSCostExplorerTool:
    name = "aws_get_cost_breakdown"
    description = "Fetches AWS cost breakdown grouped by service for a time range."
    input_schema = {
        "type": "object",
        "properties": {
            "start_date": {"type": "string", "description": "ISO 8601 start date"},
            "end_date":   {"type": "string", "description": "ISO 8601 end date"},
            "group_by":   {"type": "string", "enum": ["SERVICE", "ACCOUNT", "TAG"]},
        },
        "required": ["start_date", "end_date"],
    }

    async def execute(self, ctx: PlatformContext, **kwargs) -> str:
        # ctx.agent_id available for audit logging
        # Pure business logic — no framework knowledge
        result = await call_aws_cost_explorer(kwargs)
        return json.dumps(result)
```

Register it once in `ToolRegistry`:

```python
ToolRegistry.register("aws_cost_skill", AWSCostExplorerTool())
```

The same tool works with Pydantic AI today and OpenAI Agents SDK tomorrow, unchanged.

## LLM Gateway Integration

Both adapters route through the internal LiteLLM Gateway. Pydantic AI uses the `"openai:<model>"` model string format; the gateway's base URL is set via environment variable, not hardcoded:

```bash
OPENAI_BASE_URL=http://llm-gateway:8083/v1
OPENAI_API_KEY=sk-platform-internal      # validated by gateway, not OpenAI
AGENT_FRAMEWORK=pydantic_ai
```

The LLM Gateway remains the single choke point for all inference — token budgets, model routing, provider fallback — regardless of which adapter is active.

## Dependency Isolation

| Import | Allowed in `agent-workers`? | Owned by |
|---|---|---|
| `py_agent_core.*` | Yes | this package |
| `pydantic_ai` | **No** | `adapters/pydantic_ai.py` only |
| `agents` (openai-agents) | **No** | `adapters/openai_agents.py` only |
| `temporalio` | Yes | `workflows.py`, `activities_*.py` |
| `openai` (base client) | Only for embeddings in `activities_memory.py` | `activities_memory.py` |

## Technical Stack

- **Language**: Python 3.11+
- **Active Framework**: `pydantic-ai>=0.0.50`
- **Serialization**: Pydantic v2 (shared with Pydantic AI)
- **Observability**: OpenTelemetry Python SDK
- **Testing**: pytest + pytest-asyncio; framework adapters tested independently via mocked `AgentRunner`

## Current Status

- [ ] `pyproject.toml` initialisation
- [ ] `interfaces.py` — `AgentRunner`, `PlatformTool`, `PlatformContext`, `AgentResult`
- [ ] `manifest.py` — `AgentManifest`, `TokenUsage`, `ToolCall`
- [ ] `registry.py` — `ToolRegistry`
- [ ] `adapters/pydantic_ai.py` — `PydanticAIRunner`
- [ ] `adapters/openai_agents.py` — `OpenAIAgentsRunner` (stub)
- [ ] `factory.py` — `create_runner()`
- [ ] `telemetry.py` — OTel span helpers
- [ ] Unit tests for `PydanticAIRunner` adapter
- [ ] Unit tests for `ToolRegistry`
- [ ] Smoke test confirming `agent-workers` imports compile with `AGENT_FRAMEWORK=pydantic_ai`
