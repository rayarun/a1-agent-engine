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

"""Agent execution activities - spawns AgentWorkflow as child workflows."""

import logging
from temporalio import activity, workflow
from datetime import timedelta
from typing import Optional, Any


@activity.defn
async def run_agent(
    agent_id: str,
    prompt: str,
    tenant_id: str,
    context: Optional[dict] = None,
) -> dict:
    """
    Runs an AI agent via AgentWorkflow (spawned as a child workflow).

    This is the only SDK activity that involves an LLM. It runs the full ReAct loop
    with Claude, tool access, and HITL gates.

    Args:
        agent_id: ID of the agent to run
        prompt: User prompt/input for the agent
        tenant_id: Tenant ID for multi-tenancy
        context: Optional context dict (e.g., session state, memory)

    Returns:
        Agent result as a dict containing output, tool calls, tokens, etc.
    """
    logging.info(f"Running agent '{agent_id}' with prompt: {prompt[:100]}...")

    try:
        # Import here to avoid circular dependency at module load time
        from temporalio import workflow

        # In the context of a Temporal activity, we can execute a child workflow
        # This spawns AgentWorkflow as a child, which runs with full durable semantics
        result = await workflow.execute_child_workflow(
            "AgentWorkflow",  # workflow type name
            {
                "agent_id": agent_id,
                "input": prompt,
                "tenant_id": tenant_id,
                "context": context or {},
            },
            start_to_close_timeout=timedelta(minutes=15),
        )
        logging.info(f"Agent '{agent_id}' completed successfully")
        return result
    except Exception as e:
        logging.error(f"Agent execution failed: {e}")
        return {"error": f"Error running agent '{agent_id}': {str(e)}"}
