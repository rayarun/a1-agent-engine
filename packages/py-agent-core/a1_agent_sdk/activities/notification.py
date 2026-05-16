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

"""Notification activities - send alerts via Slack, Teams, email."""

import logging
import os
from temporalio import activity
import httpx


@activity.defn
async def notify(channel: str, message: str, tenant_id: str) -> dict:
    """
    Sends a notification to Slack, Teams, or email.

    Args:
        channel: Destination channel (e.g., "slack:#alerts", "teams:@user", "email:user@example.com")
        message: Notification message (supports markdown)
        tenant_id: Tenant ID for multi-tenancy

    Returns:
        Notification delivery status
    """
    logging.info(f"Sending notification to {channel}")

    try:
        skill_dispatcher_url = os.getenv("SKILL_DISPATCHER_URL", "http://localhost:8085")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{skill_dispatcher_url}/api/v1/skills/send-notification/invoke",
                json={
                    "args": {
                        "channel": channel,
                        "message": message,
                    },
                },
                headers={"X-Tenant-ID": tenant_id},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return {"success": True, "result": data.get("result", data)}
    except Exception as e:
        logging.error(f"Notification send failed: {e}")
        return {"success": False, "error": f"Error sending notification: {str(e)}"}
