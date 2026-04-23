import json
import logging
import os
from temporalio import activity
from openai import AsyncOpenAI
import httpx


@activity.defn
async def execute_code(code: str) -> str:
    """Executes Python code in the sandbox manager."""
    logging.info(f"Executing code in sandbox: {code[:50]}...")
    url = os.getenv("SANDBOX_MANAGER_URL", "http://localhost:8082/api/v1/execute")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={"code": code}, timeout=30.0)
            resp.raise_for_status()
            return resp.json().get("result", "No output")
    except Exception as e:
        logging.error(f"Sandbox execution failed: {e}")
        return f"Error executing code: {e}"


@activity.defn
async def invoke_skill(skill_name: str, args: dict, tenant_id: str, agent_id: str) -> str:
    """Invokes a named skill via the skill-dispatcher (runs pre/post hooks)."""
    url = os.getenv("SKILL_DISPATCHER_URL", "http://localhost:8085")
    logging.info(f"Invoking skill '{skill_name}' for agent {agent_id}")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{url}/api/v1/skills/{skill_name}/invoke",
                json={"args": args, "agent_id": agent_id},
                headers={"X-Tenant-ID": tenant_id},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return json.dumps(data.get("result", data))
    except Exception as e:
        logging.error(f"Skill invocation failed: {e}")
        return f"Error invoking skill '{skill_name}': {e}"


@activity.defn
async def reasoning_step(messages: list[dict], model: str, tool_defs: list[dict] | None = None) -> dict:
    """Executes a single LLM reasoning step via the LLM Gateway."""
    gateway_url = os.getenv("LLM_GATEWAY_URL", "http://localhost:8083/v1")
    client = AsyncOpenAI(base_url=gateway_url, api_key="sk-mock-key")

    tools = tool_defs if tool_defs else [_default_execute_code_tool()]

    logging.info(f"Calling LLM (model={model}, tools={[t['function']['name'] for t in tools]})")
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        tools=tools,
    )

    msg = response.choices[0].message
    result = {"content": msg.content, "tool_calls": None}
    if msg.tool_calls:
        result["tool_calls"] = [
            {
                "id": tc.id,
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments,
                },
            }
            for tc in msg.tool_calls
        ]
    return result


def _default_execute_code_tool() -> dict:
    return {
        "type": "function",
        "function": {
            "name": "execute_code",
            "description": "Run Python code in a secure sandbox.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "The Python code to run."}
                },
                "required": ["code"],
            },
        },
    }
