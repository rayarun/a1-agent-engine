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
Google ADK (Agent Development Kit) adapter for A1 Agent Engine.

Integrates with Temporal's GoogleAdkPlugin for deterministic execution.
Uses LiteLLM gateway for model routing (including non-Gemini models).
"""

import json
import logging
import os
from typing import Any

from models import AgentContext

logger = logging.getLogger(__name__)


def build_google_adk_agent(context: AgentContext) -> Any:
    """
    Build a Google ADK agent with platform tool bindings.

    This function is called from within AgentWorkflow.run() as workflow code
    (not an activity). The GoogleAdkPlugin on the worker transforms model calls
    into Temporal activities automatically.

    Args:
        context: Agent context

    Returns:
        Configured LlmAgent ready for runner.run_async()
    """
    try:
        from google import genai
        from google.adk.agents import LlmAgent
        from google.adk.models.lite_llm import LiteLlm
    except ImportError:
        logger.error("Google ADK not installed")
        raise

    logger.info(f"Building Google ADK agent {context.agent_id}")

    # Configure LiteLLM model (routes all inference through LiteLLM gateway)
    litellm_base_url = os.getenv("LITELLM_BASE_URL", "http://localhost:8000/v1")
    model_name = context.model  # e.g., "claude-sonnet-4-6"
    # Map to LiteLLM openai passthrough: claude-* → openai/claude-*
    litellm_model = f"openai/{model_name}" if not model_name.startswith("openai/") else model_name

    model = LiteLlm(
        model=litellm_model,
        api_base=litellm_base_url,
    )

    # Build tool definitions
    tools = _build_adk_tools(context)

    # Create agent
    agent = LlmAgent(
        name=context.agent_id,
        model=model,
        system_instruction=context.system_prompt,
        tools=tools,
    )

    logger.info(f"Google ADK agent ready with {len(tools)} tools")
    return agent


def _build_adk_tools(context: AgentContext) -> list:
    """
    Convert platform tools to Google ADK FunctionTool format.

    Since platform tools are invoked via HTTP (through the invoke_platform_tool activity),
    we create FunctionTool wrappers that bridge ADK tool calls to the activity invocation.

    This will be implemented in Phase 3 when Temporal workflow integration is verified.
    For now, return an empty list — ADK agents will run without platform tools.
    """
    logger.info("Google ADK tool binding deferred to Phase 3 (requires workflow.execute_activity)")
    return []
