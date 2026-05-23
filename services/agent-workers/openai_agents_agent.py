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
OpenAI Agents SDK adapter for A1 Agent Engine.

Integrates with Temporal's OpenAIAgentsPlugin for deterministic execution.
Routes all LLM calls through LiteLLM gateway.
"""

import json
import logging
import os
from typing import Any

from models import AgentContext

logger = logging.getLogger(__name__)


def build_openai_agents_agent(context: AgentContext) -> Any:
    """
    Build an OpenAI Agents SDK agent with platform tool bindings.

    This function is called from within AgentWorkflow.run() as workflow code.
    The OpenAIAgentsPlugin on the worker intercepts model calls and turns them
    into Temporal activities.

    Args:
        context: Agent context

    Returns:
        Configured Agent ready for Runner.run()
    """
    try:
        from agents import Agent, Model
    except ImportError:
        logger.error("OpenAI Agents SDK not installed")
        raise

    logger.info(f"Building OpenAI Agents agent {context.agent_id}")

    # Configure model to use LiteLLM gateway
    litellm_base_url = os.getenv("LITELLM_BASE_URL", "http://localhost:8000/v1")
    # OpenAI Agents expects model string like "gpt-4o"
    # We route through LiteLLM as "openai/<model>"
    model_name = context.model
    if not model_name.startswith("openai/"):
        model_name = f"openai/{model_name}"

    # Model wrapping for LiteLLM routing
    model = Model(
        model=model_name,
        base_url=litellm_base_url,
    )

    # Build tool definitions
    tools = _build_openai_tools(context)

    # Create agent
    agent = Agent(
        name=context.agent_id,
        instructions=context.system_prompt,
        model=model,
        tools=tools,
    )

    logger.info(f"OpenAI Agents agent ready with {len(tools)} tools")
    return agent


def _build_openai_tools(context: AgentContext) -> list:
    """
    Convert platform tools to OpenAI Agents SDK FunctionTool format.

    Similar to Google ADK, platform tools are invoked via the invoke_platform_tool activity.
    Deferred to Phase 3 for full Temporal integration.
    """
    logger.info("OpenAI Agents tool binding deferred to Phase 3 (requires workflow.execute_activity)")
    return []
