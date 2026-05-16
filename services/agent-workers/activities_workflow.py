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

"""Activities for HybridWorkflow step execution."""

import logging
from temporalio import activity


@activity.defn
async def invoke_agent(agent_id: str, prompt: str, tenant_id: str) -> dict:
    """
    Invokes an agent for HybridWorkflow.

    This activity is called from within HybridWorkflow when executing agent steps.
    It wraps the agent execution and returns the result.
    """
    logging.info(f"HybridWorkflow invoking agent '{agent_id}'")
    try:
        # For now, return a placeholder result
        # In reality, this would integrate with the agent execution system
        return {
            "status": "completed",
            "output": f"Agent {agent_id} processed: {prompt[:100]}",
            "tool_calls": [],
        }
    except Exception as e:
        logging.error(f"Agent invocation failed: {e}")
        return {"status": "failed", "error": str(e)}


@activity.defn
async def evaluate_condition(expression: str, context: dict) -> bool:
    """
    Evaluates a template expression (e.g., "{{ steps.risk.output.risk_level == 'high' }}").

    Used by HybridWorkflow for conditional branching in workflow steps.
    """
    logging.info(f"Evaluating condition: {expression}")
    try:
        # Import the expression resolver
        from expression import evaluate_template_condition

        result = evaluate_template_condition(expression, context)
        logging.info(f"Condition result: {result}")
        return result
    except Exception as e:
        logging.error(f"Condition evaluation failed: {e}")
        return False
