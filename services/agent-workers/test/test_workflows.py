import pytest
import respx
import httpx
import json
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker
from workflows import AgentWorkflow, execute_code

@pytest.mark.asyncio
async def test_agent_reasoning_loop():
    async with await WorkflowEnvironment.start_local() as env:
        with respx.mock:
            # 1. Mock LLM Gateway (Return a Tool Call)
            respx.post("http://localhost:8083/v1/chat/completions").mock(
                return_value=httpx.Response(200, json={
                    "id": "mock-1",
                    "model": "mock-gpt-4o",
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": None,
                            "tool_calls": [{
                                "id": "call_1",
                                "type": "function",
                                "function": {
                                    "name": "execute_code",
                                    "arguments": '{"code": "print(2+2)"}'
                                }
                            }]
                        },
                        "finish_reason": "tool_calls"
                    }]
                })
            ).side_effect = [
                # First call: return Tool Call
                httpx.Response(200, json={
                    "id": "mock-1",
                    "choices": [{"message": {"role": "assistant", "tool_calls": [{"id": "c1", "type": "function", "function": {"name": "execute_code", "arguments": '{"code": "print(4)"}'}}]}, "finish_reason": "tool_calls"}]
                }),
                # Second call: return Final Answer
                httpx.Response(200, json={
                    "id": "mock-2",
                    "choices": [{"message": {"role": "assistant", "content": "The answer is 4."}, "finish_reason": "stop"}]
                })
            ]

            # 2. Mock Sandbox Manager
            respx.post("http://localhost:8082/api/v1/execute").mock(
                return_value=httpx.Response(200, json={"result": "4"})
            )
            
            async with Worker(
                env.client,
                task_queue="reasoning-queue",
                workflows=[AgentWorkflow],
                activities=[execute_code],
            ):
                request = {
                    "agent_id": "math-agent",
                    "payload": {"prompt": "What is 2+2?"},
                    "model": "mock-gpt-4o"
                }
                
                result = await env.client.execute_workflow(
                    AgentWorkflow.run,
                    request,
                    id="reasoning-wf-id",
                    task_queue="reasoning-queue",
                )
                
                assert "The answer is 4" in result
