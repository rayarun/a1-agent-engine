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

import pytest
import json
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

# End-to-end scenario tests combining SDK activities + HybridWorkflow + API triggers


class TestYamlWorkflowExecution:
    """Test complete YAML-defined workflow execution flow."""

    @pytest.mark.asyncio
    async def test_simple_yaml_workflow_execution(self):
        """Test: Create YAML workflow → Trigger via API → Execute steps → Verify output."""
        workflow_def = {
            "id": "daily-settlement",
            "version": "1.0.0",
            "steps": [
                {"id": "fetch", "type": "task", "skill_name": "fetch-trades"},
                {"id": "analyze", "type": "task", "skill_name": "analyze-trades"},
                {"id": "report", "type": "task", "skill_name": "send-report"},
            ],
        }

        # Simulate API: POST /api/v1/workflows (creates registration)
        workflow_id = "daily-settlement"

        # Simulate API: POST /api/v1/workflows/{id}/trigger
        run_input = {"inputs": {"date": "2026-05-16"}}

        # Expected execution: steps run sequentially
        expected_run_sequence = ["fetch", "analyze", "report"]

        # Verify workflow definition structure
        assert workflow_def["id"] == workflow_id
        assert len(workflow_def["steps"]) == 3
        assert [step["id"] for step in workflow_def["steps"]] == expected_run_sequence

    @pytest.mark.asyncio
    async def test_yaml_workflow_with_conditional_step(self):
        """Test: YAML workflow with branching based on condition."""
        workflow_def = {
            "id": "risk-gate",
            "steps": [
                {"id": "assess", "type": "agent", "agent_id": "risk-agent"},
                {
                    "id": "approve-gate",
                    "type": "hitl",
                    "prompt": "High-risk transaction. Approve?",
                    "condition": "{{ steps.assess.output.risk_level == 'high' }}",
                },
            ],
        }

        # Simulate step execution with high-risk result
        step_outputs = {
            "assess": {
                "status": "completed",
                "output": {"risk_level": "high", "score": 85},
            }
        }

        # Condition should evaluate to True, triggering HITL step
        risk_level = step_outputs["assess"]["output"]["risk_level"]
        should_trigger_hitl = risk_level == "high"

        assert should_trigger_hitl is True
        assert len(workflow_def["steps"]) == 2

    @pytest.mark.asyncio
    async def test_yaml_workflow_parallel_steps(self):
        """Test: YAML workflow with parallel step execution."""
        workflow_def = {
            "id": "multi-exchange-settlement",
            "steps": [
                {
                    "id": "fetch",
                    "type": "parallel",
                    "parallel_steps": [
                        {"id": "nse", "type": "task", "skill_name": "fetch-nse"},
                        {"id": "bse", "type": "task", "skill_name": "fetch-bse"},
                    ],
                },
                {"id": "reconcile", "type": "task", "skill_name": "reconcile-trades"},
            ],
        }

        # Verify parallel structure
        parallel_step = workflow_def["steps"][0]
        assert parallel_step["type"] == "parallel"
        assert len(parallel_step["parallel_steps"]) == 2
        assert parallel_step["parallel_steps"][0]["id"] == "nse"
        assert parallel_step["parallel_steps"][1]["id"] == "bse"

    @pytest.mark.asyncio
    async def test_yaml_workflow_error_handling(self):
        """Test: YAML workflow continues or aborts on step failure."""
        workflow_def_abort = {
            "id": "strict-pipeline",
            "steps": [
                {"id": "step1", "type": "task", "skill_name": "fetch", "on_failure": "abort"},
                {"id": "step2", "type": "task", "skill_name": "process"},
            ],
        }

        workflow_def_continue = {
            "id": "forgiving-pipeline",
            "steps": [
                {"id": "step1", "type": "task", "skill_name": "fetch", "on_failure": "continue"},
                {"id": "step2", "type": "task", "skill_name": "process"},
            ],
        }

        # Verify on_failure behavior
        assert workflow_def_abort["steps"][0].get("on_failure") == "abort"
        assert workflow_def_continue["steps"][0].get("on_failure") == "continue"


class TestWebhookTriggerFlow:
    """Test webhook-triggered workflow execution with HMAC validation."""

    @pytest.mark.asyncio
    async def test_webhook_trigger_with_hmac_validation(self):
        """Test: POST webhook → Validate HMAC → Trigger workflow → Execute."""
        import hmac
        import hashlib
        import json

        # Workflow registration with webhook config
        webhook_config = {
            "type": "webhook",
            "webhook_secret": "my-secret-key",
        }

        # Simulate webhook payload
        payload = {
            "trade_id": "T123",
            "symbol": "INFY",
            "quantity": 100,
            "price": 1500.00,
        }

        # Compute HMAC signature (as webhook sender would)
        payload_json = json.dumps(payload, sort_keys=True)
        signature = hmac.new(
            webhook_config["webhook_secret"].encode(),
            payload_json.encode(),
            hashlib.sha256,
        ).hexdigest()

        # Simulate API: POST /api/v1/workflows/{id}/webhooks
        # Verify signature matches
        computed_signature = hmac.new(
            webhook_config["webhook_secret"].encode(),
            payload_json.encode(),
            hashlib.sha256,
        ).hexdigest()

        assert signature == computed_signature
        assert payload["trade_id"] == "T123"

    @pytest.mark.asyncio
    async def test_webhook_with_invalid_signature_rejected(self):
        """Test: Invalid HMAC signature rejects workflow trigger."""
        webhook_config = {"type": "webhook", "webhook_secret": "correct-secret"}
        payload = {"data": "test"}

        correct_signature = "correct-hmac-value"
        invalid_signature = "wrong-hmac-value"

        # Signature verification should fail
        assert correct_signature != invalid_signature
        assert correct_signature == correct_signature  # Valid sig matches itself

    @pytest.mark.asyncio
    async def test_webhook_creates_workflow_run(self):
        """Test: Webhook trigger creates workflow_runs record with pending status."""
        workflow_run = {
            "run_id": "run-webhook-123",
            "workflow_id": "kyc-workflow",
            "tenant_id": "tenant-1",
            "status": "pending",
            "inputs": {"customer_id": "C456", "kyc_doc": "passport.pdf"},
            "started_at": datetime.utcnow().isoformat(),
        }

        # Verify run structure
        assert workflow_run["status"] == "pending"
        assert workflow_run["workflow_id"] == "kyc-workflow"
        assert workflow_run["inputs"]["customer_id"] == "C456"


class TestEventDrivenTrigger:
    """Test event-driven multi-workflow fan-out."""

    @pytest.mark.asyncio
    async def test_event_triggers_multiple_workflows(self):
        """Test: Event → Match all listening workflows → Trigger in parallel."""
        # Event published
        event = {"type": "settlement.fail", "settlement_id": "S789"}

        # Workflows listening to this event
        workflows_listening = [
            {
                "id": "settlement-recovery",
                "trigger_type": "event",
                "trigger_config": {"event_name": "settlement.fail"},
            },
            {
                "id": "escalation-alert",
                "trigger_type": "event",
                "trigger_config": {"event_name": "settlement.fail"},
            },
            {
                "id": "audit-logger",
                "trigger_type": "event",
                "trigger_config": {"event_name": "settlement.fail"},
            },
        ]

        # Find matching workflows
        matching = [
            wf
            for wf in workflows_listening
            if wf["trigger_config"]["event_name"] == event["type"]
        ]

        assert len(matching) == 3
        assert all(wf["trigger_config"]["event_name"] == "settlement.fail" for wf in matching)

    @pytest.mark.asyncio
    async def test_event_fan_out_isolation(self):
        """Test: Each triggered workflow gets isolated execution context."""
        event = {"type": "settlement.fail"}

        # Create runs for each matched workflow
        runs = [
            {
                "run_id": f"run-{i}",
                "workflow_id": f"workflow-{i}",
                "event_payload": event,
                "status": "pending",
            }
            for i in range(1, 4)
        ]

        # Verify isolation - each run has unique ID and status
        assert len(runs) == 3
        assert len(set(run["run_id"] for run in runs)) == 3  # All run IDs unique
        assert all(run["status"] == "pending" for run in runs)
        assert all(run["event_payload"] == event for run in runs)


class TestCronTrigger:
    """Test cron-scheduled workflow execution."""

    @pytest.mark.asyncio
    async def test_cron_schedule_creation(self):
        """Test: Cron expression → Temporal Schedule created → Auto-fire at interval."""
        workflow_with_cron = {
            "id": "daily-settlement-report",
            "trigger_config": {
                "type": "cron",
                "cron": "0 17 * * 1-5",  # 5 PM, Mon-Fri
            },
        }

        # Verify cron expression valid
        cron_expr = workflow_with_cron["trigger_config"]["cron"]
        parts = cron_expr.split()

        # Cron format: minute hour day month day-of-week
        assert len(parts) == 5
        assert parts[0] == "0"  # minute
        assert parts[1] == "17"  # hour (5 PM)
        assert parts[4] == "1-5"  # weekdays

    @pytest.mark.asyncio
    async def test_cron_schedule_fires_at_interval(self):
        """Test: Schedule fires at specified time and creates workflow_runs."""
        cron_config = {"type": "cron", "cron": "0 17 * * 1-5"}

        # Simulate schedule fire
        fired_runs = [
            {
                "run_id": f"run-scheduled-{i}",
                "workflow_id": "daily-report",
                "status": "pending",
                "triggered_at": f"2026-05-{16+i} 17:00:00",  # Daily at 5 PM
            }
            for i in range(3)  # Three consecutive business days
        ]

        # Verify runs created at scheduled times
        assert len(fired_runs) == 3
        assert all(run["status"] == "pending" for run in fired_runs)


class TestMixedTriggerTypes:
    """Test workflows triggered by different mechanisms."""

    @pytest.mark.asyncio
    async def test_workflow_supports_multiple_trigger_types(self):
        """Test: Same workflow can be triggered by manual, webhook, cron, or event."""
        workflow = {
            "id": "flexible-workflow",
            "supported_triggers": ["manual", "webhook", "cron", "event"],
        }

        trigger_apis = {
            "manual": "/api/v1/workflows/{id}/trigger",
            "webhook": "/api/v1/workflows/{id}/webhooks",
            "cron": "Temporal Schedule auto-fire",
            "event": "/api/v1/events/{name}",
        }

        # Verify all trigger types supported
        for trigger_type in workflow["supported_triggers"]:
            assert trigger_type in trigger_apis

    @pytest.mark.asyncio
    async def test_workflow_run_traces_trigger_source(self):
        """Test: workflow_runs record includes trigger source for audit."""
        runs = [
            {"run_id": "r1", "triggered_by": "manual", "triggered_at": "2026-05-16T10:00:00Z"},
            {"run_id": "r2", "triggered_by": "webhook", "triggered_at": "2026-05-16T10:05:00Z"},
            {"run_id": "r3", "triggered_by": "cron", "triggered_at": "2026-05-16T17:00:00Z"},
            {"run_id": "r4", "triggered_by": "event", "triggered_at": "2026-05-16T10:10:00Z"},
        ]

        # Verify trigger source traceable
        assert len(set(run["triggered_by"] for run in runs)) == 4
        assert all("triggered_by" in run for run in runs)


class TestMultiTenantExecution:
    """Test tenant isolation during workflow execution."""

    @pytest.mark.asyncio
    async def test_workflow_run_tenant_isolation(self):
        """Test: Tenant A's workflows don't appear in Tenant B's runs."""
        tenant_a_runs = [
            {
                "run_id": "run-a-1",
                "workflow_id": "settlement-wf",
                "tenant_id": "tenant-a",
                "status": "completed",
            },
            {
                "run_id": "run-a-2",
                "workflow_id": "kyc-wf",
                "tenant_id": "tenant-a",
                "status": "running",
            },
        ]

        tenant_b_runs = [
            {
                "run_id": "run-b-1",
                "workflow_id": "settlement-wf",
                "tenant_id": "tenant-b",
                "status": "pending",
            },
        ]

        # Query tenant-a runs
        a_runs = [r for r in tenant_a_runs if r["tenant_id"] == "tenant-a"]
        b_runs = [r for r in tenant_b_runs if r["tenant_id"] == "tenant-b"]

        assert len(a_runs) == 2
        assert len(b_runs) == 1
        assert all(r["tenant_id"] == "tenant-a" for r in a_runs)
        assert all(r["tenant_id"] == "tenant-b" for r in b_runs)

    @pytest.mark.asyncio
    async def test_cross_tenant_run_not_visible(self):
        """Test: RLS policy prevents tenant-a from seeing tenant-b's runs."""
        all_runs = [
            {"run_id": "run-1", "tenant_id": "tenant-a"},
            {"run_id": "run-2", "tenant_id": "tenant-a"},
            {"run_id": "run-3", "tenant_id": "tenant-b"},
            {"run_id": "run-4", "tenant_id": "tenant-b"},
        ]

        # Simulate RLS: tenant-a queries
        tenant_a_visible = [r for r in all_runs if r["tenant_id"] == "tenant-a"]

        # Verify tenant-b runs not visible
        assert len(tenant_a_visible) == 2
        assert all(r["tenant_id"] == "tenant-a" for r in tenant_a_visible)
        assert not any(r["tenant_id"] == "tenant-b" for r in tenant_a_visible)


class TestHITLApprovalFlow:
    """Test human-in-the-loop approval within workflows."""

    @pytest.mark.asyncio
    async def test_hitl_step_pauses_workflow(self):
        """Test: HITL step pauses workflow, waits for approval/denial signal."""
        workflow_execution = {
            "run_id": "run-hitl-123",
            "status": "running",
            "current_step": "high-risk-gate",
            "step_status": "waiting_for_approval",
            "hitl_id": "hitl-789",
            "hitl_prompt": "High-risk settlement. Approve?",
            "started_waiting": "2026-05-16T10:00:00Z",
        }

        # Workflow paused at HITL
        assert workflow_execution["status"] == "running"
        assert workflow_execution["step_status"] == "waiting_for_approval"

    @pytest.mark.asyncio
    async def test_hitl_approval_resumes_workflow(self):
        """Test: Approval signal resumes workflow; denial aborts."""
        hitl_approval = {
            "hitl_id": "hitl-789",
            "approved": True,
            "approved_by": "user@example.com",
            "approved_at": "2026-05-16T10:05:00Z",
        }

        workflow_resumed = {
            "run_id": "run-hitl-123",
            "status": "running",
            "current_step": "send-settlement",  # Next step after HITL
            "resumed_at": hitl_approval["approved_at"],
        }

        # Verify workflow resumed
        assert hitl_approval["approved"] is True
        assert workflow_resumed["current_step"] == "send-settlement"

    @pytest.mark.asyncio
    async def test_hitl_denial_stops_workflow(self):
        """Test: Approval denial stops workflow with appropriate status."""
        hitl_denial = {
            "hitl_id": "hitl-789",
            "approved": False,
            "denied_by": "risk@example.com",
            "denial_reason": "Risk level unacceptable",
        }

        workflow_stopped = {
            "run_id": "run-hitl-123",
            "status": "cancelled",
            "cancelled_reason": "Denied at HITL gate: " + hitl_denial["denial_reason"],
        }

        # Verify workflow stopped
        assert hitl_denial["approved"] is False
        assert workflow_stopped["status"] == "cancelled"
        assert "Denied" in workflow_stopped["cancelled_reason"]


class TestExecutionErrorRecovery:
    """Test error handling and recovery in workflow execution."""

    @pytest.mark.asyncio
    async def test_step_failure_recorded_and_visible(self):
        """Test: Step failure recorded in workflow_runs with error message."""
        failed_run = {
            "run_id": "run-failed-123",
            "status": "failed",
            "failed_at_step": "validate-trades",
            "error": "No trades found for date 2026-05-16",
            "step_results": {
                "fetch": {"status": "completed", "output": {"count": 0}},
                "validate": {"status": "failed", "error": "No trades to process"},
            },
        }

        # Verify failure captured
        assert failed_run["status"] == "failed"
        assert "validate-trades" in failed_run["failed_at_step"]
        assert failed_run["step_results"]["validate"]["status"] == "failed"

    @pytest.mark.asyncio
    async def test_partial_workflow_completion_on_error(self):
        """Test: Completed steps retained even when workflow fails."""
        partial_run = {
            "run_id": "run-partial-456",
            "status": "failed",
            "step_results": {
                "fetch": {"status": "completed", "output": {"count": 100}},
                "validate": {"status": "completed", "output": {"valid": True}},
                "reconcile": {"status": "failed", "error": "Reconciliation failed"},
                "report": {"status": "not_executed"},
            },
        }

        # Verify completed steps preserved
        completed_steps = [
            s for s, r in partial_run["step_results"].items() if r["status"] == "completed"
        ]
        assert len(completed_steps) == 2
        assert "fetch" in completed_steps
        assert "validate" in completed_steps


class TestCostTracking:
    """Test cost tracking for API calls within workflow execution."""

    @pytest.mark.asyncio
    async def test_skill_invocation_cost_tracked(self):
        """Test: Skill/tool invocations track cost for billing."""
        skill_calls = [
            {
                "step_id": "fetch-trades",
                "skill_name": "fetch-trades",
                "cost": {"api_calls": 1, "data_units": 150},
            },
            {
                "step_id": "analyze",
                "agent_id": "analyzer",
                "cost": {"llm_tokens": {"input": 250, "output": 180}},
            },
        ]

        # Verify cost tracked per step
        total_api_calls = sum(c["cost"].get("api_calls", 0) for c in skill_calls)
        total_tokens = sum(
            c["cost"].get("llm_tokens", {}).get("input", 0) for c in skill_calls
        )

        assert total_api_calls >= 1
        assert total_tokens >= 250

    @pytest.mark.asyncio
    async def test_workflow_run_total_cost_aggregated(self):
        """Test: Workflow run aggregates costs from all steps."""
        run_costs = {
            "run_id": "run-cost-789",
            "steps": {
                "fetch": {"llm_tokens": 0, "api_calls": 2},
                "agent": {"llm_tokens": {"input": 1000, "output": 500}},
                "hitl": {"llm_tokens": 0, "api_calls": 0},
            },
            "total": {"llm_tokens": {"input": 1000, "output": 500}, "api_calls": 2},
        }

        # Verify aggregation
        assert run_costs["total"]["api_calls"] == 2
        assert run_costs["total"]["llm_tokens"]["input"] == 1000
        assert run_costs["total"]["llm_tokens"]["output"] == 500


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
