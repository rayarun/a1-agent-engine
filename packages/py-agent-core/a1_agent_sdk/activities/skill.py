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

"""Platform skill and tool invocation activities."""

import json
import logging
import os
from typing import Any
from temporalio import activity
import httpx


@activity.defn
async def invoke_skill(skill_name: str, args: dict, tenant_id: str) -> dict:
    """
    Invokes a named skill via the skill-dispatcher.

    Args:
        skill_name: Name of the skill to invoke
        args: Skill arguments as a dict
        tenant_id: Tenant ID for multi-tenancy

    Returns:
        Result from the skill invocation as a dict
    """
    url = os.getenv("SKILL_DISPATCHER_URL", "http://localhost:8085")
    logging.info(f"Invoking skill '{skill_name}'")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{url}/api/v1/skills/{skill_name}/invoke",
                json={"args": args},
                headers={"X-Tenant-ID": tenant_id},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("result", data)
    except Exception as e:
        logging.error(f"Skill invocation failed: {e}")
        return {"error": f"Error invoking skill '{skill_name}': {str(e)}"}


@activity.defn
async def invoke_tool(tool_name: str, tool_version: str, args: dict, tenant_id: str, mutating: bool = False) -> dict:
    """
    Invokes a direct tool via the skill-dispatcher.

    Args:
        tool_name: Name of the tool to invoke
        tool_version: Version of the tool
        args: Tool arguments as a dict
        tenant_id: Tenant ID for multi-tenancy
        mutating: Whether the tool makes mutations (for idempotency tracking)

    Returns:
        Result from the tool invocation as a dict
    """
    skill_dispatcher_url = os.getenv("SKILL_DISPATCHER_URL", "http://localhost:8085")
    logging.info(f"Invoking direct tool '{tool_name}'")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{skill_dispatcher_url}/api/v1/tools/invoke",
                json={
                    "tool": {"name": tool_name, "version": tool_version},
                    "args": args,
                    "mutating": mutating,
                },
                headers={"X-Tenant-ID": tenant_id},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("result", data)
    except Exception as e:
        logging.error(f"Direct tool invocation failed: {e}")
        return {"error": f"Error invoking tool '{tool_name}': {str(e)}"}
