# a1-agent-sdk

Platform SDK for building hybrid Temporal workflows with AI agents.

Exposes platform primitives as Temporal activities so developers can write their own `@workflow.defn` and `@activity.defn` code that calls platform capabilities.

## Installation

```bash
pip install a1-agent-sdk
```

## Quick Start

```python
from temporalio import workflow, activity
from datetime import timedelta
from a1_agent_sdk import invoke_mcp_tool, run_agent, hitl_approval, invoke_skill

@activity.defn
async def validate_trades(trades: list[dict]) -> dict:
    """Your custom validation logic."""
    return {"valid": len(trades) > 0}

@workflow.defn
class SettlementPipeline:
    @workflow.run
    async def run(self, params: dict) -> dict:
        tenant_id = params["tenant_id"]

        # Fetch trades from NSE via MCP tool
        trades = await workflow.execute_activity(
            invoke_mcp_tool,
            args=["NSE Trade Feed API", "get_trades", {"date": params["date"]}, tenant_id],
            start_to_close_timeout=timedelta(minutes=5),
        )

        # Validate with your custom logic
        validation = await workflow.execute_activity(
            validate_trades,
            args=[trades.get("results", [])],
            start_to_close_timeout=timedelta(minutes=2),
        )

        # Run AI agent for analysis
        analysis = await workflow.execute_activity(
            run_agent,
            args=["settlement-agent", str(trades), tenant_id],
            start_to_close_timeout=timedelta(minutes=15),
        )

        # HITL gate if needed
        if not validation["valid"]:
            approved = await workflow.execute_activity(
                hitl_approval,
                args=["Validation failed. Approve settlement?", {"analysis": analysis}, tenant_id],
                start_to_close_timeout=timedelta(hours=1),
            )
            if not approved.get("approved"):
                return {"status": "rejected"}

        return {"status": "completed", "analysis": analysis}
```

## Provided Activities

### `invoke_skill(skill_name, args, tenant_id) → dict`
Invokes a platform skill via skill-dispatcher.

### `invoke_tool(tool_name, tool_version, args, tenant_id, mutating) → dict`
Invokes a direct tool endpoint.

### `invoke_mcp_tool(server_name, tool_name, args, tenant_id) → dict`
**New** — Direct deterministic access to MCP server tools (no LLM).

### `run_agent(agent_id, prompt, tenant_id, context) → dict`
Runs an AI agent (the only activity that uses LLM). Spawns AgentWorkflow as a child workflow.

### `hitl_approval(prompt, context, tenant_id, timeout_minutes) → dict`
Human-in-the-loop approval gate. Pauses workflow until decision.

### `kg_search(graph_id, query, tenant_id) → dict`
Searches a knowledge graph.

### `kg_query(graph_id, start_node_id, tenant_id, depth) → dict`
Queries a knowledge graph starting from a node.

### `notify(channel, message, tenant_id) → dict`
Sends a notification (Slack, Teams, email).

### `get_platform_activities() → list`
Returns all SDK activities for Worker registration.

## Worker Registration

```python
from temporalio.client import Client
from temporalio.worker import Worker
from a1_agent_sdk import get_platform_activities
from my_workflows import SettlementPipeline, validate_trades

async def main():
    client = await Client.connect("localhost:7233")
    worker = Worker(
        client,
        task_queue="my-settlement-queue",
        workflows=[SettlementPipeline],
        activities=[
            validate_trades,  # Your custom activities
            *get_platform_activities(),  # SDK platform activities
        ],
    )
    await worker.run()
```

## Environment Variables

- `SKILL_DISPATCHER_URL`: Skill dispatcher endpoint (default: `http://localhost:8085`)
- `MCP_REGISTRY_URL`: MCP registry endpoint (default: `http://localhost:8090`)
- `KG_SERVICE_URL`: Knowledge graph service endpoint (default: `http://localhost:8093`)
- `WORKFLOW_INITIATOR_URL`: Workflow initiator endpoint (default: `http://localhost:8081`)

## License

Apache-2.0
