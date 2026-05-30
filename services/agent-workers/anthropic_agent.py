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
Anthropic Agent SDK adapter for Temporal execution.

Thin wrapper around AnthropicAgentCore that handles Temporal-specific concerns:
- HITL approval resumption via workflow signals
- AgentDecision format for workflow state machine
- Platform tool bridge with approval context

The multi-turn ReAct loop logic is in AnthropicAgentCore (framework-agnostic).
"""

import json
import logging
from typing import Optional

from anthropic_agent_core import AnthropicAgentCore
from platform_tool_bridge import ToolExecutionClient

logger = logging.getLogger(__name__)


class AnthropicTemporalAgent:
    """Temporal-specific wrapper around AnthropicAgentCore."""

    def __init__(self, context: dict):
        """
        Initialize the Temporal wrapper.

        Args:
            context: Agent context (id, tenant, model, system_prompt, tools, etc.)
        """
        # Create core with platform tool bridge executor
        tool_executor = TemporalToolExecutor(context)
        self.core = AnthropicAgentCore(context, tool_executor)
        self.context = context
        self.approved_tool_use_ids = set()

    async def execute_step(self, session, context: dict) -> dict:
        """
        Execute one step of the ReAct loop (Temporal activity).

        Handles:
        - Resumption with approved HITL tools
        - Detection of new HITL requests
        - AgentDecision format for workflow state machine

        Args:
            session: Agent session with message history
            context: Agent context

        Returns:
            AgentDecision dict for workflow
        """
        messages = session.messages

        # Check for approved tools to resume with
        approved_tools = context.get("approved_hitl_tools", {})
        executed_tool_use_ids = context.get("_executed_tool_use_ids", set())

        # If resuming with approved tool, execute it first
        if approved_tools and messages:
            for msg in messages:
                if msg.get("role") == "assistant":
                    content = msg.get("content", [])
                    blocks = content if isinstance(content, list) else [content]

                    for block in blocks:
                        block_type = (
                            block.get("type")
                            if isinstance(block, dict)
                            else getattr(block, "type", None)
                        )
                        block_name = (
                            block.get("name")
                            if isinstance(block, dict)
                            else getattr(block, "name", None)
                        )
                        block_id = (
                            block.get("id", "")
                            if isinstance(block, dict)
                            else getattr(block, "id", "")
                        )

                        if block_type == "tool_use" and block_id not in executed_tool_use_ids:
                            if block_name in approved_tools:
                                logger.info(
                                    f"[TEMPORAL] Executing approved tool: {block_name} (id={block_id})"
                                )

                                # Execute approved tool
                                tool_input = (
                                    block.get("input", {})
                                    if isinstance(block, dict)
                                    else getattr(block, "input", {})
                                )
                                approval_id = approved_tools[block_name]
                                executor = TemporalToolExecutor(
                                    context,
                                    approved_hitl_tools={block_name: approval_id},
                                )

                                result_str = await executor.invoke(block_name, tool_input)
                                result = (
                                    json.loads(result_str)
                                    if result_str.startswith("{")
                                    else result_str
                                )

                                # Mark as executed
                                if "_executed_tool_use_ids" not in context:
                                    context["_executed_tool_use_ids"] = set()
                                context["_executed_tool_use_ids"].add(block_id)

                                # Add result to messages
                                messages.append(
                                    {
                                        "role": "user",
                                        "content": [
                                            {
                                                "type": "tool_result",
                                                "tool_use_id": block_id,
                                                "content": str(result),
                                            }
                                        ],
                                    }
                                )

                                return {
                                    "final_answer": None,
                                    "tool_calls": [],
                                    "messages_delta": messages,
                                    "continue_loop": True,
                                    "hitl_pending": False,
                                }

        # Run one iteration of core ReAct loop
        logger.info(f"[TEMPORAL] Calling core.run_react_loop with {len(messages)} messages")
        result = await self.core.run_react_loop(messages)
        logger.info(f"[TEMPORAL] Core returned status={result.get('status')}, error={result.get('error')}")

        # Map core result to Temporal AgentDecision format
        if result["status"] == "completed":
            return {
                "final_answer": result["final_answer"],
                "tool_calls": [],
                "messages_delta": result["messages"],
                "continue_loop": False,
                "hitl_pending": False,
                "tokens_in": result["tokens_in"],
                "tokens_out": result["tokens_out"],
            }

        if result["status"] == "hitl_pending":
            # A tool requires human approval. Surface it so the workflow pauses,
            # emits an approval event, and waits for the operator's decision.
            return {
                "final_answer": None,
                "tool_calls": [],
                "messages_delta": result["messages"],
                "continue_loop": False,
                "hitl_pending": True,
                "hitl_approval_id": result.get("hitl_approval_id", ""),
                "hitl_tool_name": result.get("hitl_tool_name", ""),
                "hitl_tool_args": result.get("hitl_tool_args", {}),
                "tokens_in": result["tokens_in"],
                "tokens_out": result["tokens_out"],
            }

        if result["status"] == "max_iterations":
            return {
                "final_answer": result["final_answer"],
                "tool_calls": [],
                "messages_delta": result["messages"],
                "continue_loop": False,
                "tokens_in": result["tokens_in"],
                "tokens_out": result["tokens_out"],
            }

        if result["status"] == "error":
            return {
                "final_answer": None,
                "tool_calls": [],
                "messages_delta": result["messages"],
                "continue_loop": False,
                "error": result["error"],
                "tokens_in": result["tokens_in"],
                "tokens_out": result["tokens_out"],
            }

        return {
            "final_answer": None,
            "tool_calls": [],
            "messages_delta": result["messages"],
            "continue_loop": True,
            "tokens_in": result["tokens_in"],
            "tokens_out": result["tokens_out"],
        }


class TemporalToolExecutor:
    """Tool executor for Temporal mode (uses ToolExecutionClient with platform bridge)."""

    def __init__(self, context: dict, approved_hitl_tools: Optional[dict] = None):
        self.context = context
        self.approved_hitl_tools = approved_hitl_tools or {}
        self.client = ToolExecutionClient(
            context.get("agent_id", "unknown"),
            context.get("tenant_id", "default-tenant"),
            approved_hitl_tools=self.approved_hitl_tools,
        )

    async def invoke(self, tool_name: str, tool_input: dict) -> str:
        """Invoke tool via platform bridge."""
        return await self.client.invoke_direct_tool(tool_name, "1.0.0", tool_input, mutating=True)


async def build_anthropic_agent_and_run(context: dict, messages: Optional[list] = None) -> dict:
    """
    Build and run an Anthropic Agent SDK agent (Temporal entry point).

    Wrapper for backward compatibility with Temporal workflows.
    Delegates to AnthropicTemporalAgent.

    Args:
        context: Agent context (id, tenant, model, system_prompt, tools, etc.)
        messages: Existing message history (for HITL resumption)

    Returns:
        AgentDecision dict compatible with AgentWorkflow expectations
    """
    try:
        logger.info(f"[TEMPORAL] Building Anthropic agent {context.get('agent_id', 'unknown')}")

        # Initialize or resume message history
        if messages is None or len(messages) == 0:
            messages = [{"role": "user", "content": context.get("prompt", "Help me")}]
        else:
            # Filter out system role messages (Anthropic API doesn't accept them)
            messages = [m for m in messages if m.get("role") != "system"]

        logger.info(f"[TEMPORAL] Initialized {len(messages)} messages")

        # Create minimal session-like object for compatibility with execute_step
        class TemporalSession:
            def __init__(self, msgs):
                self.messages = msgs

        session = TemporalSession(messages)

        # Run via wrapper
        agent = AnthropicTemporalAgent(context)
        logger.info(f"[TEMPORAL] Created agent, calling execute_step")
        return await agent.execute_step(session, context)
    except Exception as e:
        logger.error(f"[TEMPORAL] Exception in build_anthropic_agent_and_run: {e}", exc_info=True)
        return {
            "final_answer": f"Error: {str(e)}",
            "tool_calls": [],
            "messages_delta": messages or [],
            "continue_loop": False,
            "error": str(e),
            "tokens_in": 0,
            "tokens_out": 0,
        }
