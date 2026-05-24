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
Implements multi-turn ReAct loop directly in-process.
"""

import json
import logging
import os
from typing import Optional

import anthropic

from direct_tools_executor import DirectToolsExecutor

logger = logging.getLogger(__name__)


class DirectAnthropicAgent:
    """Execute Anthropic agents directly without Temporal."""

    def __init__(self, context: dict):
        self.context = context
        self.agent_id = context.get("agent_id", "unknown")
        self.tenant_id = context.get("tenant_id", "default-tenant")
        self.model = context.get("model", "claude-opus-4-7")
        self.system_prompt = context.get("system_prompt", "You are a helpful assistant")
        self.max_iterations = context.get("max_iterations", 5)

        # Initialize Anthropic client (direct, no Temporal plugin)
        anthropic_base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
        anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")
        self.client = anthropic.AsyncAnthropic(
            base_url=anthropic_base_url,
            api_key=anthropic_api_key,
        )

        self.tools_executor = DirectToolsExecutor()

    def _build_tool_definitions(self) -> list[dict]:
        """Build Anthropic tool definitions from context tools."""
        tools = []

        # Add platform tools
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

        logger.info(f"Built {len(tools)} tool definitions for direct Anthropic agent")
        return tools

    async def execute_step(self, session: "AgentSession", context: dict) -> dict:
        """
        Execute one step of the ReAct loop.

        Args:
            session: Agent session with message history
            context: Agent context

        Returns:
            {
                "final_answer": str or None,
                "tool_calls": list[dict],
                "continue_loop": bool,
            }
        """
        tool_definitions = self._build_tool_definitions()
        messages = session.messages

        # Call Anthropic API
        try:
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=8192,
                system=self.system_prompt,
                tools=tool_definitions,
                messages=messages,
            )
            logger.info(f"Anthropic API call: stop_reason={response.stop_reason}")
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            return {
                "final_answer": None,
                "tool_calls": [],
                "continue_loop": False,
                "error": str(e),
            }

        # Check if agent finished
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
                "continue_loop": False,
            }

        # Process tool calls
        if response.stop_reason == "tool_use":
            # Add assistant message to history
            session.messages.append({"role": "assistant", "content": response.content})

            # Process each tool_use block
            tool_results = []
            for block in response.content:
                if block.type == "tool_use":
                    tool_name = block.name
                    tool_input = block.input or {}
                    tool_use_id = block.id

                    logger.info(f"Tool use: {tool_name}")

                    # Invoke tool directly (no Skill Dispatcher)
                    result_str = await self.tools_executor.invoke(tool_name, tool_input)
                    result = (
                        json.loads(result_str) if result_str.startswith("{") else result_str
                    )

                    tool_results.append(
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_id,
                            "content": json.dumps(result),
                        }
                    )

                    session.add_event("tool_result", name=tool_name)

            # Add tool results to messages
            for result in tool_results:
                session.messages.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "tool_result",
                                "tool_use_id": result.get("tool_use_id", ""),
                                "content": str(result.get("content", "")),
                            }
                        ],
                    }
                )

            return {
                "final_answer": None,
                "tool_calls": [
                    {"name": t.name} for t in response.content if t.type == "tool_use"
                ],
                "continue_loop": True,
            }

        # Unexpected stop reason
        logger.warning(f"Unexpected stop_reason: {response.stop_reason}")
        return {
            "final_answer": None,
            "tool_calls": [],
            "continue_loop": False,
        }
