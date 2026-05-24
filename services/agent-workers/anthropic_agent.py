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
from typing import Any, Optional

import anthropic
from platform_tool_bridge import ToolExecutionClient

logger = logging.getLogger(__name__)


async def build_anthropic_agent_and_run(context: dict, messages: Optional[list] = None) -> dict:
    """
    Build and run an Anthropic Agent SDK agent.

    This is the entry point for activity-contained execution of Anthropic agents.
    The full multi-turn loop runs here with HITL checkpoints.

    Args:
        context: Agent context (id, tenant, prompt, model, system_prompt, skills, tools)
        messages: Existing message history (for HITL resumption). If None, starts fresh with prompt.

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

    # Initialize or resume message history
    if messages is None or len(messages) == 0:
        messages = [{"role": "user", "content": context.get('prompt', 'Help me')}]
    else:
        # Filter out system role messages (Anthropic API doesn't accept them in messages array)
        messages = [m for m in messages if m.get("role") != "system"]

    tokens_in = 0
    tokens_out = 0

    # Multi-turn ReAct loop
    max_iterations = context.get('max_iterations', 5)
    for iteration in range(max_iterations):
        logger.info(f"Iteration {iteration + 1}/{max_iterations}")

        try:
            # Check if resuming with an approved tool that needs execution
            approved_tools = context.get('approved_hitl_tools', {})
            logger.info(f"[DEBUG] approved_hitl_tools in context: {approved_tools}")
            logger.info(f"[DEBUG] messages count: {len(messages)}")

            found_approved = False
            if approved_tools and messages:
                logger.info(f"[DEBUG] Approved tools present: {list(approved_tools.keys())}")

                for msg_idx, msg in enumerate(messages):
                    msg_role = msg.get("role")
                    logger.info(f"[DEBUG] Message {msg_idx}: role={msg_role}, type={type(msg)}")

                    if msg_role == "assistant":
                        logger.info(f"[DEBUG]   Found assistant message at index {msg_idx}")
                        content = msg.get("content")
                        logger.info(f"[DEBUG]   Content type: {type(content)}, is_list: {isinstance(content, list)}")

                        if content:
                            blocks = content if isinstance(content, list) else [content]
                            logger.info(f"[DEBUG]   Blocks count: {len(blocks)}")

                            for block_idx, block in enumerate(blocks):
                                logger.info(f"[DEBUG]     Block {block_idx}: type={type(block)}")

                                # Handle both dict and Anthropic SDK ContentBlock objects
                                if isinstance(block, dict):
                                    block_type = block.get("type")
                                    block_name = block.get("name")
                                    logger.info(f"[DEBUG]       Dict block: type={block_type}, name={block_name}")
                                else:
                                    block_type = getattr(block, "type", None)
                                    block_name = getattr(block, "name", None)
                                    logger.info(f"[DEBUG]       SDK block: type={block_type}, name={block_name}")

                                if block_type == "tool_use":
                                    logger.info(f"[DEBUG]       Found tool_use: {block_name}")
                                    if block_name in approved_tools:
                                        logger.info(f"[APPROVED TOOL MATCH] tool={block_name}, id={approved_tools[block_name]}")
                                        found_approved = True

                                        # Execute the approved tool directly
                                        if isinstance(block, dict):
                                            tool_use_id = block.get("id")
                                            tool_input = block.get("input", {})
                                        else:
                                            tool_use_id = getattr(block, "id", "")
                                            tool_input = getattr(block, "input", {})

                                        logger.info(f"[DEBUG] Executing tool={block_name}, id={tool_use_id}")
                                        # Pass the approval context so platform tool bridge skips HITL for this execution
                                        # The tool was already approved at the model layer; execution should not re-check HITL
                                        approval_id = approved_tools[block_name]  # Get the approval_id from the approved_tools dict
                                        tool_execution_client = ToolExecutionClient(
                                            context.get('agent_id', 'unknown'),
                                            context.get('tenant_id', 'default-tenant'),
                                            approved_hitl_tools={block_name: approval_id}  # Pass approval_id to bypass HITL
                                        )

                                        try:
                                            result_str = await tool_execution_client.invoke_direct_tool(
                                                str(block_name), "1.0.0", tool_input, mutating=True
                                            )

                                            result = json.loads(result_str) if result_str.startswith("{") else result_str
                                            logger.info(f"[TOOL RESULT] {block_name}: success")
                                        except Exception as e:
                                            logger.error(f"[TOOL ERROR] {block_name}: {e}")
                                            result = {"error": str(e)}

                                        # Add tool result to messages
                                        messages.append({
                                            "role": "user",
                                            "content": [
                                                {
                                                    "type": "tool_result",
                                                    "tool_use_id": tool_use_id,
                                                    "content": str(result),
                                                }
                                            ],
                                        })
                                        # Clear approved_tools and return - don't continue to model call
                                        context["approved_hitl_tools"] = {}
                                        logger.info("[DEBUG] Approved tool executed, returning to workflow with tool result")
                                        return {
                                            "final_answer": None,
                                            "tool_calls": [],
                                            "messages_delta": messages,
                                            "continue_loop": True,
                                            "hitl_pending": False,
                                            "tokens_in": tokens_in,
                                            "tokens_out": tokens_out,
                                        }

                    # If we found and executed an approved tool, should have returned above
                    if found_approved:
                        logger.info("[DEBUG] Approved tool was marked found but return didn't execute - breaking")
                        break
            else:
                logger.info(f"[DEBUG] No approved tools or no messages. approved_tools={bool(approved_tools)}, messages={len(messages) if messages else 0}")

            # If we broke due to approved tool, don't call model
            if found_approved:
                logger.info("[DEBUG] Approved tool executed in iteration, returning")
                return {
                    "final_answer": None,
                    "tool_calls": [],
                    "messages_delta": messages,
                    "continue_loop": True,
                    "hitl_pending": False,
                    "tokens_in": tokens_in,
                    "tokens_out": tokens_out,
                }

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
