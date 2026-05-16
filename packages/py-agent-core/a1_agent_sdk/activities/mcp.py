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

"""MCP server tool invocation activities."""

import json
import logging
import os
from temporalio import activity
import httpx


@activity.defn
async def invoke_mcp_tool(server_name: str, tool_name: str, args: dict, tenant_id: str) -> dict:
    """
    Invokes a tool on an external MCP server.

    Provides direct, deterministic access to MCP server tools without LLM involvement.
    Full Temporal retry semantics apply.

    Args:
        server_name: Name of the MCP server (e.g., "NSE Trade Feed API")
        tool_name: Name of the tool to invoke on the server
        args: Tool arguments as a dict
        tenant_id: Tenant ID for multi-tenancy

    Returns:
        Result from the MCP tool invocation as a dict
    """
    mcp_registry_url = os.getenv("MCP_REGISTRY_URL", "http://localhost:8090")
    logging.info(f"Invoking MCP tool '{tool_name}' on server '{server_name}'")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{mcp_registry_url}/api/v1/mcp/servers/{server_name}/call",
                json={"tool_name": tool_name, "args": args},
                headers={"X-Tenant-ID": tenant_id},
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("result", data)
    except Exception as e:
        logging.error(f"MCP tool invocation failed: {e}")
        return {"error": f"Error invoking MCP tool '{tool_name}' on server '{server_name}': {str(e)}"}
