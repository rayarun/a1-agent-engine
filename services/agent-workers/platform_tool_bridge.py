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
Platform Tool Bridge — Framework-neutral tool execution client.

Routes tool invocations from any agent framework (PydanticAI, Anthropic, ADK, OpenAI)
through the platform's Skill Dispatcher, maintaining unified governance (HITL, audit, cost).
"""

import json
import logging
import os
from typing import Optional

import httpx

from hitl_markers import build_hitl_marker

logger = logging.getLogger(__name__)


class ToolExecutionClient:
    """
    Framework-neutral HTTP client for tool execution.

    All tool invocations (skills, direct tools, MCP tools, code execution) route through
    this client to the appropriate platform services. This preserves HITL gates, audit hooks,
    tenant isolation, and cost tracking regardless of the agent framework.
    """

    def __init__(self, agent_id: str, tenant_id: str, approved_hitl_tools: Optional[dict] = None):
        """
        Initialize the tool execution client.

        Args:
            agent_id: ID of the agent using these tools
            tenant_id: Tenant context for RLS
            approved_hitl_tools: Pre-approved tool IDs bypassing HITL (optional)
        """
        self.agent_id = agent_id
        self.tenant_id = tenant_id
        self.approved_hitl_tools = approved_hitl_tools or {}
        self.skill_dispatcher_url = os.getenv("SKILL_DISPATCHER_URL", "http://localhost:8085")
        self.mcp_registry_url = os.getenv("MCP_REGISTRY_URL", "http://localhost:8090")
        self.sandbox_manager_url = os.getenv("SANDBOX_MANAGER_URL", "http://localhost:8082")
        self.workflow_initiator_url = os.getenv("WORKFLOW_INITIATOR_URL", "http://localhost:8081")

    async def execute_code(self, code: str) -> str:
        """Execute Python code in sandbox via HTTP."""
        logger.info(f"Executing code for agent {self.agent_id}")
        url = f"{self.sandbox_manager_url}/api/v1/execute"
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json={"code": code}, timeout=30.0)
                resp.raise_for_status()
                return resp.json().get("result", "No output")
        except Exception as e:
            logger.error(f"Code execution failed: {e}")
            return f"Error executing code: {e}"

    async def invoke_skill(self, skill_name: str, args: dict) -> str:
        """Invoke a skill via Skill Dispatcher HTTP."""
        logger.info(f"Invoking skill '{skill_name}' for agent {self.agent_id}")
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.skill_dispatcher_url}/api/v1/skills/{skill_name}/invoke",
                    json={"args": args, "agent_id": self.agent_id},
                    headers={"X-Tenant-ID": self.tenant_id},
                    timeout=30.0,
                )
                resp.raise_for_status()
                data = resp.json()
                return json.dumps(data.get("result", data))
        except Exception as e:
            logger.error(f"Skill invocation failed: {e}")
            return f"Error invoking skill '{skill_name}': {e}"

    async def invoke_mcp_tool(self, server_id: str, tool_name: str, args: dict) -> str:
        """Invoke a tool on an MCP server via HTTP."""
        logger.info(f"Invoking MCP tool '{tool_name}' on server {server_id}")
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    f"{self.mcp_registry_url}/api/v1/mcp/servers/{server_id}/call",
                    json={"tool_name": tool_name, "args": args},
                    headers={"X-Tenant-ID": self.tenant_id},
                    timeout=60.0,
                )
                resp.raise_for_status()
                data = resp.json()
                return json.dumps(data.get("result", data))
        except Exception as e:
            logger.error(f"MCP tool invocation failed: {e}")
            return f"Error invoking MCP tool '{tool_name}': {e}"

    async def invoke_direct_tool(self, tool_name: str, tool_version: str, args: dict, mutating: bool) -> str:
        """
        Invoke a direct tool via Skill Dispatcher HTTP.

        Handles HITL approval gates: if the Skill Dispatcher returns 202 (Accepted),
        the tool requires human approval. This method stores the approval request
        and returns a marker for the agent framework to detect.
        """
        logger.info(f"Invoking direct tool '{tool_name}' for agent {self.agent_id}")
        try:
            async with httpx.AsyncClient() as client:
                # If pre-approved by prior HITL, bypass the gate
                approval_id = self.approved_hitl_tools.get(tool_name, "")
                if approval_id:
                    logger.info(f"Tool '{tool_name}' is pre-approved (approval_id={approval_id}), bypassing HITL")
                    resp = await client.post(
                        f"{self.skill_dispatcher_url}/api/v1/tools/invoke",
                        json={
                            "tool": {"name": tool_name, "version": tool_version},
                            "args": args,
                            "agent_id": self.agent_id,
                            "mutating": mutating,
                            "hitl_approval_id": approval_id,
                        },
                        headers={"X-Tenant-ID": self.tenant_id},
                        timeout=30.0,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    return json.dumps(data.get("result", data))

                resp = await client.post(
                    f"{self.skill_dispatcher_url}/api/v1/tools/invoke",
                    json={
                        "tool": {"name": tool_name, "version": tool_version},
                        "args": args,
                        "agent_id": self.agent_id,
                        "mutating": mutating,
                    },
                    headers={"X-Tenant-ID": self.tenant_id},
                    timeout=30.0,
                )

                # Handle HITL approval requirement (202 Accepted)
                if resp.status_code == 202:
                    data = resp.json()
                    hitl_workflow_id = data.get("hitl_workflow_id", "")
                    logger.info(f"Tool '{tool_name}' requires HITL approval. HITL Workflow: {hitl_workflow_id}")

                    # Get the actual agent workflow ID from Temporal activity context
                    agent_workflow_id = None
                    try:
                        from temporalio import activity
                        info = activity.info()
                        if info:
                            agent_workflow_id = info.workflow_id
                            logger.info(f"Got agent workflow ID from activity context: {agent_workflow_id}")
                    except Exception as e:
                        logger.error(f"Failed to get workflow ID from activity context: {e}")

                    if not agent_workflow_id:
                        agent_workflow_id = hitl_workflow_id

                    try:
                        # Store the approval request
                        logger.info(f"[APPROVAL STORE] Starting approval storage at {self.workflow_initiator_url}/api/v1/approvals")
                        logger.info(f"[APPROVAL STORE] Workflow ID: {agent_workflow_id}, Agent: {self.agent_id}, Tool: {tool_name}")

                        store_resp = await client.post(
                            f"{self.workflow_initiator_url}/api/v1/approvals",
                            json={
                                "workflow_id": agent_workflow_id,
                                "agent_id": self.agent_id,
                                "tool_name": tool_name,
                                "tool_args": args,
                                "reason": f"Mutating tool '{tool_name}' requires human approval",
                            },
                            headers={"X-Tenant-ID": self.tenant_id},
                            timeout=10.0,
                        )
                        logger.info(f"[APPROVAL STORE] POST request completed with status: {store_resp.status_code}")
                        store_resp.raise_for_status()
                        approval_data = store_resp.json()
                        approval_id = approval_data.get("approval_id", "")
                        logger.info(f"Stored HITL approval request: {approval_id} (response: {approval_data})")

                        # Return marker — workflow will emit approval event and wait for signal
                        marker = build_hitl_marker(approval_id, tool_name, args)
                        logger.info(f"Returning HITL marker: {marker[:80]}...")
                        return marker
                    except Exception as e:
                        logger.error(f"Failed to store approval: {type(e).__name__}: {e}", exc_info=True)
                        error_msg = f"HITL approval storage failed: {e}"
                        logger.error(f"Returning error instead of marker: {error_msg}")
                        return error_msg

                resp.raise_for_status()
                data = resp.json()
                return json.dumps(data.get("result", data))
        except Exception as e:
            logger.error(f"Direct tool invocation failed: {e}")
            return f"Error invoking tool '{tool_name}': {e}"
