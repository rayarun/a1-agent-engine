# Copyright 2026 Arun Ray
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""
Anthropic Agent SDK adapter for direct (non-Temporal) execution.

Thin wrapper around AnthropicAgentCore that handles direct execution concerns:
- HTTP/SSE event streaming
- Session state management (in-memory)
- Per-iteration execution (called multiple times for multi-turn loop)

The multi-turn ReAct loop logic is in AnthropicAgentCore (framework-agnostic).
"""

import logging

from anthropic_agent_core import AnthropicAgentCore
from direct_tools_executor import DirectToolsExecutor

logger = logging.getLogger(__name__)


class DirectAnthropicAgent:
    """Direct execution wrapper around AnthropicAgentCore."""

    def __init__(self, context: dict):
        """
        Initialize the direct execution agent.

        Args:
            context: Agent context (id, tenant, model, system_prompt, tools, etc.)
        """
        # Create core with direct tool executor (bypasses Skill Dispatcher)
        tool_executor = DirectToolExecutor()
        self.core = AnthropicAgentCore(context, tool_executor)
        self.context = context

    async def execute_step(self, session: "AgentSession", context: dict) -> dict:
        """
        Execute one step of the ReAct loop (direct/HTTP mode).

        Handles multi-iteration agent loop by running the core's ReAct loop
        and emitting events to the session for streaming.

        Args:
            session: Agent session with message history and event queue
            context: Agent context

        Returns:
            {
                "final_answer": str or None,
                "tool_calls": list[dict],
                "continue_loop": bool,
            }
        """

        async def emit_event(event_type: str, **kwargs) -> None:
            """Emit event to session for streaming."""
            session.add_event(event_type, **kwargs)

        # Run full ReAct loop with event callback
        result = await self.core.run_react_loop(session.messages, iteration_callback=emit_event)

        # Update session messages
        session.messages = result["messages"]

        # Emit final_answer event if complete
        if result["status"] == "completed":
            session.add_event("final_answer", content=result["final_answer"])
            session.state["finished"] = True
            return {
                "final_answer": result["final_answer"],
                "tool_calls": result["tool_calls"],
                "continue_loop": False,
            }

        # Mark session as finished if any terminal status
        if result["status"] in ["error", "max_iterations"]:
            session.state["finished"] = True
            return {
                "final_answer": result.get("final_answer"),
                "tool_calls": result.get("tool_calls", []),
                "continue_loop": False,
            }

        # Continue loop (shouldn't reach here, but handle gracefully)
        return {
            "final_answer": None,
            "tool_calls": result.get("tool_calls", []),
            "continue_loop": True,
        }


class DirectToolExecutor:
    """Tool executor for direct mode (bypasses Skill Dispatcher, direct execution)."""

    def __init__(self):
        self.tools_executor = DirectToolsExecutor()

    async def invoke(self, tool_name: str, tool_input: dict) -> str:
        """Invoke tool directly (no platform bridge, no governance)."""
        return await self.tools_executor.invoke(tool_name, tool_input)
