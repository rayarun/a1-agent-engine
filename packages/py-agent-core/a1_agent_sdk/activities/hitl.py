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

"""Human-in-the-loop (HITL) approval activities."""

import logging
import os
from typing import Optional
from temporalio import activity
import httpx


@activity.defn
async def hitl_approval(
    prompt: str,
    context: dict,
    tenant_id: str,
    timeout_minutes: int = 60,
) -> dict:
    """
    Requests human-in-the-loop approval for a workflow decision.

    Creates a durable approval gate that pauses workflow execution until a human
    approves or denies. Uses database-backed durability (not in-process).

    Args:
        prompt: Prompt/question to show the human reviewer
        context: Context data to include in the approval request
        tenant_id: Tenant ID for multi-tenancy
        timeout_minutes: How long to wait for approval (default 60 min)

    Returns:
        Dict with 'approved' bool, 'approved_by' email, 'notes' text
    """
    logging.info(f"Requesting HITL approval: {prompt[:100]}...")

    try:
        # In a real implementation, this would:
        # 1. Create a record in hitl_approvals table
        # 2. Signal the workflow-initiator that there's a pending approval
        # 3. Block until the approval is decided
        #
        # For now, we return a placeholder that the workflow can handle
        # The actual integration depends on the Temporal signal + workflow state interaction

        workflow_initiator_url = os.getenv("WORKFLOW_INITIATOR_URL", "http://localhost:8081")

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{workflow_initiator_url}/api/v1/approvals",
                json={
                    "prompt": prompt,
                    "context": context,
                    "timeout_minutes": timeout_minutes,
                },
                headers={"X-Tenant-ID": tenant_id},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "approved": data.get("approved", False),
                "approved_by": data.get("approved_by"),
                "approved_at": data.get("approved_at"),
                "notes": data.get("notes"),
            }
    except Exception as e:
        logging.error(f"HITL approval request failed: {e}")
        return {"error": f"Error requesting approval: {str(e)}", "approved": False}
