import os
import json
import logging
from temporalio import activity
from openai import AsyncOpenAI
import httpx

@activity.defn
async def execute_code(code: str) -> str:
    """Executes code using the Sandbox Manager."""
    logging.info(f"Executing code in sandbox: {code[:50]}...")
    url = os.getenv("SANDBOX_MANAGER_URL", "http://localhost:8082/api/v1/execute")
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={"code": code}, timeout=30.0)
            resp.raise_for_status()
            return resp.json().get("result", "No output")
    except Exception as e:
        logging.error(f"Sandbox execution failed: {e}")
        return f"Error executing code: {str(e)}"

@activity.defn
async def reasoning_step(messages: list[dict], model: str) -> dict:
    """Executes a single reasoning step via the LLM Gateway."""
    gateway_url = os.getenv("LLM_GATEWAY_URL", "http://localhost:8083/v1")
    client = AsyncOpenAI(base_url=gateway_url, api_key="sk-mock-key")
    
    logging.info(f"Calling LLM Gateway for reasoning step...")
    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        tools=[{
            "type": "function",
            "function": {
                "name": "execute_code",
                "description": "Run Python code in a secure sandbox.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "code": {"type": "string", "description": "The Python code to run."}
                    },
                    "required": ["code"]
                }
            }
        }]
    )
    
    # Return serializable dict
    msg = response.choices[0].message
    result = {
        "content": msg.content,
        "tool_calls": None
    }
    if msg.tool_calls:
        result["tool_calls"] = [
            {
                "id": tc.id,
                "function": {
                    "name": tc.function.name,
                    "arguments": tc.function.arguments
                }
            } for tc in msg.tool_calls
        ]
    return result
