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
Anthropic Agent SDK adapter for A1 Agent Engine.

Implements activity-contained multi-turn ReAct loop using Anthropic's SDK directly.
No Temporal contrib plugin (none exists), so the full agent loop runs inside a single
Temporal activity with durable retry semantics at the activity boundary.
"""

import json
import logging
import os
from typing import Any

import anthropic
from platform_tool_bridge import ToolExecutionClient

logger = logging.getLogger(__name__)


async def build_anthropic_agent_and_run(context: dict) -> dict:
    """
    Build and run an Anthropic Agent SDK agent.

    This is the entry point for activity-contained execution of Anthropic agents.
    The full multi-turn loop runs here with HITL checkpoints.

    Args:
        context: Agent context (id, tenant, prompt, model, system_prompt, skills, tools)

    Returns:
        AgentDecision dict compatible with AgentWorkflow expectations
    """
    logger.info(f"Building Anthropic agent {context.get('agent_id', 'unknown')}")

    # Set up client to use Anthropic API directly (bypass OpenAI-compat routing)
    # Use configured endpoint from environment or fallback to standard Anthropic
    anthropic_base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")

    client = anthropic.AsyncAnthropic(
        base_url=anthropic_base_url,
        api_key=anthropic_api_key,
    )

    model = context.get('model', 'claude-opus-4-7')

    # Build tool definitions from platform tools
    tool_definitions = _build_tool_definitions(context)

    # Initialize message history with user prompt
    messages = [{"role": "user", "content": context.get('prompt', 'Help me')}]
    tokens_in = 0
    tokens_out = 0

    # Multi-turn ReAct loop
    max_iterations = context.get('max_iterations', 5)
    for iteration in range(max_iterations):
        logger.info(f"Iteration {iteration + 1}/{max_iterations}")

        try:
            # Call Anthropic API
            response = await client.messages.create(
                model=model,
                max_tokens=8192,
                system=context.get('system_prompt', 'You are a helpful assistant'),
                tools=tool_definitions,
                messages=messages,
            )

            # Track tokens
            if hasattr(response.usage, "input_tokens"):
                tokens_in += response.usage.input_tokens
            if hasattr(response.usage, "output_tokens"):
                tokens_out += response.usage.output_tokens

            logger.info(f"Response stop_reason: {response.stop_reason}")

            # Check if agent has finished (end_turn)
            if response.stop_reason == "end_turn":
                final_answer = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        final_answer = block.text
                        break
                logger.info(f"Agent finished with answer: {final_answer[:100]}...")
                return {
                    "final_answer": final_answer,
                    "tool_calls": [],
                    "messages_delta": messages,
                    "continue_loop": False,
                    "hitl_pending": False,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                }

            # Process tool calls
            if response.stop_reason == "tool_use":
                # Add assistant message to history
                messages.append({"role": "assistant", "content": response.content})

                # Process each tool_use block
                tool_results = []
                tool_execution_client = ToolExecutionClient(context.get('agent_id', 'unknown'), context.get('tenant_id', 'default-tenant'))
                hitl_pending = False
                hitl_approval_id = None
                hitl_tool_name = None
                hitl_tool_args = None

                for block in response.content:
                    if block.type == "tool_use":
                        tool_name = block.name
                        tool_input = block.input or {}
                        tool_use_id = block.id

                        logger.info(f"Tool use: {tool_name}")

                        # Invoke tool via platform bridge
                        try:
                            result_str = await tool_execution_client.invoke_direct_tool(
                                tool_name, "1.0.0", tool_input, mutating=True
                            )

                            # Check for HITL marker
                            if result_str.startswith("__HITL_PENDING__"):
                                hitl_pending = True
                                parts = result_str.split("::")
                                if len(parts) >= 3:
                                    hitl_approval_id = parts[1]
                                    hitl_tool_name = parts[2]
                                    hitl_tool_args = json.loads(parts[3]) if len(parts) > 3 else tool_input
                                logger.info(f"HITL pending: {hitl_approval_id}")
                                break
                            result = json.loads(result_str) if result_str.startswith("{") else result_str
                        except Exception as e:
                            logger.error(f"Tool invocation failed: {e}")
                            result = {"error": str(e)}

                        tool_results.append({"type": "tool_result", "tool_use_id": tool_use_id, "content": json.dumps(result)})

                if hitl_pending:
                    # Return with HITL pending flag
                    return {
                        "final_answer": None,
                        "tool_calls": [],
                        "messages_delta": messages,
                        "continue_loop": False,
                        "hitl_pending": True,
                        "hitl_approval_id": hitl_approval_id,
                        "hitl_tool_name": hitl_tool_name,
                        "hitl_tool_args": hitl_tool_args,
                        "tokens_in": tokens_in,
                        "tokens_out": tokens_out,
                    }

                # Add tool results to messages (Anthropic format)
                for result in tool_results:
                    messages.append({
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": result.get("tool_use_id", ""),
                                "content": str(result.get("content", "")),
                            }
                        ],
                    })
                continue

            # Unexpected stop reason
            logger.warning(f"Unexpected stop_reason: {response.stop_reason}")
            break

        except Exception as e:
            logger.error(f"Error in iteration {iteration + 1}: {e}", exc_info=True)
            return {
                "final_answer": None,
                "tool_calls": [],
                "messages_delta": messages,
                "continue_loop": False,
                "error": str(e),
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
            }

    # Max iterations reached
    return {
        "final_answer": "Max iterations reached without completion",
        "tool_calls": [],
        "messages_delta": messages,
        "continue_loop": False,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
    }


def _build_tool_definitions(context: dict) -> list[dict]:
    """
    Convert platform tool specs to Anthropic tool definition format.

    Anthropic tools are defined as dicts with:
    - name: tool name (alphanumeric + underscores)
    - description: human-readable
    - input_schema: JSON Schema object for parameters
    """
    tools = []

    # Add platform tools (system + manifest-specified + skills)
    all_tools = list(context.get('system_tools', [])) + list(context.get('tools', []))

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

    logger.info(f"Built {len(tools)} tool definitions for Anthropic")
    return tools
