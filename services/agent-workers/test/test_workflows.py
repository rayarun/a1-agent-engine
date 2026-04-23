import pytest
import respx
import httpx
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from workflows import AgentWorkflow
from activities_agent import execute_code, reasoning_step
from activities_memory import recall_memories, store_memory


@pytest.mark.asyncio
async def test_agent_reasoning_loop():
    async with await WorkflowEnvironment.start_local() as env:
        with respx.mock:
            # Mock LLM Gateway: first call returns a tool call, second returns a final answer.
            respx.post("http://localhost:8083/v1/chat/completions").mock(
                side_effect=[
                    httpx.Response(200, json={
                        "id": "mock-1",
                        "model": "mock-gpt-4o",
                        "choices": [{
                            "message": {
                                "role": "assistant",
                                "content": None,
                                "tool_calls": [{
                                    "id": "c1",
                                    "type": "function",
                                    "function": {
                                        "name": "execute_code",
                                        "arguments": '{"code": "print(4)"}'
                                    }
                                }]
                            },
                            "finish_reason": "tool_calls"
                        }]
                    }),
                    httpx.Response(200, json={
                        "id": "mock-2",
                        "model": "mock-gpt-4o",
                        "choices": [{
                            "message": {
                                "role": "assistant",
                                "content": "The answer is 4.",
                                "tool_calls": None
                            },
                            "finish_reason": "stop"
                        }]
                    }),
                ]
            )

            # Mock embedding calls (recall_memories + store_memory both call this)
            respx.post("http://localhost:8083/v1/embeddings").mock(
                return_value=httpx.Response(200, json={
                    "object": "list",
                    "data": [{"object": "embedding", "index": 0, "embedding": [0.1] * 1536}],
                    "model": "mock-embedding-v1"
                })
            )

            # Mock Sandbox Manager
            respx.post("http://localhost:8082/api/v1/execute").mock(
                return_value=httpx.Response(200, json={"result": "4"})
            )

            async with Worker(
                env.client,
                task_queue="test-reasoning-queue",
                workflows=[AgentWorkflow],
                activities=[execute_code, reasoning_step, recall_memories, store_memory],
            ):
                request = {
                    "agent_id": "math-agent",
                    "payload": {"prompt": "What is 2+2?"},
                    "model": "mock-gpt-4o"
                }

                result = await env.client.execute_workflow(
                    AgentWorkflow.run,
                    request,
                    id="reasoning-wf-test",
                    task_queue="test-reasoning-queue",
                )

                assert "The answer is 4" in result


@pytest.mark.asyncio
async def test_agent_no_tool_calls():
    """Workflow completes in one iteration when LLM returns a direct answer."""
    async with await WorkflowEnvironment.start_local() as env:
        with respx.mock:
            respx.post("http://localhost:8083/v1/chat/completions").mock(
                return_value=httpx.Response(200, json={
                    "id": "mock-direct",
                    "model": "mock-gpt-4o",
                    "choices": [{
                        "message": {"role": "assistant", "content": "Paris is the capital of France.", "tool_calls": None},
                        "finish_reason": "stop"
                    }]
                })
            )
            respx.post("http://localhost:8083/v1/embeddings").mock(
                return_value=httpx.Response(200, json={
                    "object": "list",
                    "data": [{"object": "embedding", "index": 0, "embedding": [0.0] * 1536}],
                    "model": "mock-embedding-v1"
                })
            )

            async with Worker(
                env.client,
                task_queue="test-direct-queue",
                workflows=[AgentWorkflow],
                activities=[execute_code, reasoning_step, recall_memories, store_memory],
            ):
                request = {
                    "agent_id": "geo-agent",
                    "payload": {"prompt": "What is the capital of France?"},
                    "model": "mock-gpt-4o"
                }

                result = await env.client.execute_workflow(
                    AgentWorkflow.run,
                    request,
                    id="direct-answer-wf-test",
                    task_queue="test-direct-queue",
                )

                assert "Paris" in result
