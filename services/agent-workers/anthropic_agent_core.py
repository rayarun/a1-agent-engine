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
Anthropic Agent SDK core logic (framework-agnostic).

This module contains the shared multi-turn ReAct loop used by both
Temporal and direct execution modes. It abstracts away execution-mode-specific
details (HITL signaling, event streaming, session management, etc.) by
accepting callbacks and tool executors as parameters.

Execution modes (Temporal vs. direct) are thin wrappers around this core.
"""

import json
import logging
import os
from typing import Callable, Optional, Protocol

import anthropic

from hitl_markers import parse_hitl_marker

logger = logging.getLogger(__name__)


class ToolExecutor(Protocol):
    """Protocol for tool execution (implemented by wrappers)."""

    async def invoke(self, tool_name: str, tool_input: dict) -> str:
        """Execute a tool and return result as JSON string."""
        ...


class AnthropicAgentCore:
    """
    Framework-agnostic Anthropic Agent SDK ReAct loop.

    This class encapsulates all Anthropic SDK-specific logic:
    - Anthropic client initialization and configuration
    - Tool definition building
    - Multi-turn ReAct loop (LLM calls, tool invocation, response processing)
    - Thinking block extraction
    - Token tracking

    Execution-mode-specific details (Temporal, direct, HTTP) are delegated
    to wrappers via callbacks and tool executor abstractions.
    """

    def __init__(self, context: dict, tool_executor: ToolExecutor):
        """
        Initialize the core agent.

        Args:
            context: Agent context (id, tenant, model, system_prompt, tools, etc.)
            tool_executor: Tool execution abstraction (varies by execution mode)
        """
        self.context = context
        self.tool_executor = tool_executor
        self.agent_id = context.get("agent_id", "unknown")
        self.tenant_id = context.get("tenant_id", "default-tenant")
        self.model = context.get("model", "claude-opus-4-7")
        self.system_prompt = context.get("system_prompt", "You are a helpful assistant")
        self.max_iterations = context.get("max_iterations", 5)

        # Initialize Anthropic client (direct to API or corporate proxy)
        anthropic_base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
        api_key = os.getenv("ANTHROPIC_API_KEY", "")

        logger.info(f"[CORE] Initializing Anthropic client for agent {self.agent_id}")

        # Strip trailing /v1 if present (SDK adds it automatically)
        base_url = anthropic_base_url
        if base_url.endswith("/v1"):
            base_url = base_url[:-3]

        self.client = anthropic.AsyncAnthropic(base_url=base_url, api_key=api_key)

    def build_tool_definitions(self) -> list[dict]:
        """
        Build Anthropic-compatible tool definitions from context tools.

        Converts platform tool specs to Anthropic's format:
        - name: alphanumeric + underscores
        - description: human-readable
        - input_schema: JSON Schema for parameters
        """
        tools = []

        # Add platform tools (system + manifest-specified + skills)
        all_tools = list(self.context.get("system_tools", [])) + list(
            self.context.get("tools", [])
        )

        for tool_def in all_tools:
            tool_name = tool_def.get("name", "").replace("-", "_").replace(".", "_")
            tool_description = tool_def.get("description", f"Execute {tool_name} tool")
            input_schema = tool_def.get("input_schema", {"type": "object", "properties": {}})

            tools.append(
                {
                    "name": tool_name,
                    "description": tool_description,
                    "input_schema": input_schema,
                }
            )

        logger.info(f"[CORE] Built {len(tools)} tool definitions for Anthropic")
        return tools

    async def run_react_loop(
        self,
        messages: list[dict],
        iteration_callback: Optional[Callable] = None,
    ) -> dict:
        """
        Execute the core multi-turn ReAct loop.

        This is the framework-agnostic loop logic shared between Temporal
        and direct execution modes. It:
        1. Calls Anthropic API with current messages
        2. Processes response (end_turn, tool_use, or error)
        3. Executes tools via tool_executor
        4. Appends results to message history
        5. Continues looping until completion

        Args:
            messages: Current message history (will be mutated)
            iteration_callback: Optional callback invoked after each LLM or tool event
                Format: await callback(event_type: str, **kwargs)
                Events: "thinking", "tool_call", "tool_result"

        Returns:
            {
                "status": "completed" | "error" | "max_iterations",
                "final_answer": str or None,
                "messages": updated message history,
                "thinking_blocks": list[str],
                "tool_calls": list[{"name": str, "input": dict}],
                "iterations": int,
                "tokens_in": int,
                "tokens_out": int,
                "error": str or None,
            }
        """
        tool_definitions = self.build_tool_definitions()
        result = {
            "thinking_blocks": [],
            "tool_calls": [],
            "iterations": 0,
            "tokens_in": 0,
            "tokens_out": 0,
            "error": None,
        }

        for iteration in range(self.max_iterations):
            result["iterations"] = iteration + 1
            logger.info(f"[LOOP] Iteration {iteration + 1}/{self.max_iterations}")

            try:
                # Call Anthropic API
                response = await self.client.messages.create(
                    model=self.model,
                    max_tokens=8192,
                    system=self.system_prompt,
                    tools=tool_definitions,
                    messages=messages,
                )

                logger.info(f"[LOOP] API response: stop_reason={response.stop_reason}")

                # Track tokens
                if hasattr(response.usage, "input_tokens"):
                    result["tokens_in"] += response.usage.input_tokens
                if hasattr(response.usage, "output_tokens"):
                    result["tokens_out"] += response.usage.output_tokens

                # Extract thinking blocks
                for block in response.content:
                    if block.type == "thinking":
                        thinking_text = getattr(block, "thinking", "")
                        if thinking_text:
                            result["thinking_blocks"].append(thinking_text)
                            if iteration_callback:
                                await iteration_callback("thinking", content=thinking_text)

                # Check if agent finished (end_turn)
                if response.stop_reason == "end_turn":
                    final_answer = ""
                    for block in response.content:
                        if hasattr(block, "text"):
                            final_answer = block.text
                            break
                    logger.info(f"[LOOP] Agent finished: {final_answer[:100]}...")
                    result["status"] = "completed"
                    result["final_answer"] = final_answer
                    result["messages"] = messages
                    return result

                # Process tool calls
                if response.stop_reason == "tool_use":
                    logger.info(f"[LOOP] Got tool_use stop_reason, processing tools")
                    # Add assistant message to history
                    messages.append({"role": "assistant", "content": response.content})

                    # Process each tool_use block
                    tool_results = []
                    tool_blocks = [b for b in response.content if b.type == "tool_use"]
                    logger.info(f"[LOOP] Found {len(tool_blocks)} tool blocks to execute")

                    for block in tool_blocks:
                        tool_name = block.name
                        tool_input = block.input or {}
                        tool_use_id = block.id

                        logger.info(f"[LOOP] Executing tool: {tool_name} (id={tool_use_id})")
                        result["tool_calls"].append({"name": tool_name, "input": tool_input})

                        # Emit tool_call event before execution
                        if iteration_callback:
                            await iteration_callback("tool_call", name=tool_name)

                        # Execute tool
                        try:
                            logger.info(f"[LOOP] Invoking tool_executor.invoke({tool_name}, ...)")
                            result_str = await self.tool_executor.invoke(tool_name, tool_input)
                            logger.info(f"[LOOP] Tool result received, length={len(result_str) if result_str else 0}")

                            # HITL gate: the tool bridge returns this marker when a
                            # tool requires human approval. Stop the loop and surface
                            # the pending approval so the workflow can pause and wait
                            # for a decision (otherwise the marker is fed back to the
                            # LLM as a tool result and the agent loops to max iterations).
                            hitl = parse_hitl_marker(result_str)
                            if hitl is not None:
                                logger.info(f"[LOOP] HITL approval required for tool: {tool_name}")
                                result["status"] = "hitl_pending"
                                result["hitl_approval_id"] = hitl["approval_id"]
                                result["hitl_tool_name"] = hitl["tool_name"] or tool_name
                                result["hitl_tool_args"] = hitl["tool_args"] or tool_input
                                # Keep the assistant tool_use message (already appended)
                                # so the resume path can find and execute the approved tool.
                                result["messages"] = messages
                                return result

                            result_obj = (
                                json.loads(result_str)
                                if result_str.startswith("{")
                                else result_str
                            )
                            logger.info(f"[LOOP] Tool result: {tool_name} success")
                        except Exception as e:
                            logger.error(f"[LOOP] Tool execution failed: {tool_name}: {e}", exc_info=True)
                            result_obj = {"error": str(e)}

                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": tool_use_id,
                                "content": json.dumps(result_obj),
                            }
                        )

                        # Emit tool_result event
                        if iteration_callback:
                            await iteration_callback("tool_result", name=tool_name)

                    # Add tool results to messages
                    logger.info(f"[LOOP] Adding {len(tool_results)} tool results to messages")
                    for res in tool_results:
                        messages.append(
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": res.get("tool_use_id", ""),
                                        "content": str(res.get("content", "")),
                                    }
                                ],
                            }
                        )
                    logger.info(f"[LOOP] Messages now has {len(messages)} entries, continuing to next iteration")
                    # Continue to next iteration
                    continue

                # Unexpected stop reason
                logger.warning(f"[LOOP] Unexpected stop_reason: {response.stop_reason}")
                result["status"] = "error"
                result["final_answer"] = f"Unexpected stop_reason: {response.stop_reason}"
                result["messages"] = messages
                return result

            except Exception as e:
                logger.error(f"[LOOP] Error in iteration {iteration + 1}: {e}", exc_info=True)
                result["status"] = "error"
                result["error"] = str(e)
                result["messages"] = messages
                return result

        # Max iterations reached
        logger.warning(f"[LOOP] Max iterations ({self.max_iterations}) reached")
        result["status"] = "max_iterations"
        result["final_answer"] = f"Exceeded max iterations ({self.max_iterations})"
        result["messages"] = messages
        return result
