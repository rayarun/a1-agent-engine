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

import sys
import asyncio
import logging
import os
import threading

# Diagnostic block to catch top-level import errors
try:
    from temporalio.client import Client
    from temporalio.worker import Worker

    # CRITICAL: Import pydantic_ai_agent FIRST to apply monkey patch before any Usage objects are created.
    # This import triggers module-level code that patches PydanticAI's Usage.incr method.
    import pydantic_ai_agent  # noqa: F401

    # Workflows are deterministic
    from workflows import AgentWorkflow, HybridWorkflow

    # Activities are non-deterministic (all moved to separate files)
    from activities_agent import execute_code, reasoning_step, invoke_skill, discover_mcp_tools, invoke_mcp_tool, resolve_mcp_servers, pydantic_ai_reasoning_step, fetch_system_tools, invoke_direct_tool, anthropic_agents_run, invoke_platform_tool
    from activities_workflow import invoke_agent, evaluate_condition
    from activities_memory import recall_memories, store_memory
    from activities_cost import record_cost_event

    # Phase 3: Direct execution HTTP server
    from direct_http_handler import setup_http_server

    # TODO: Phase 4 - Register Temporal contrib plugins (OpenAIAgentsPlugin, GoogleAdkPlugin)
    # For now, ADK and OpenAI agents route through activities without Temporal plugins
    # This defers fine-grained durability per LLM call in favor of simpler Phase 3 implementation
except Exception as e:
    print(f"CRITICAL STARTUP ERROR: Failed to import modules: {e}")
    sys.exit(1)

async def main():
    # Setup logging with unbuffered output
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        force=True
    )
    logger = logging.getLogger(__name__)
    # Force unbuffered output
    import sys
    sys.stdout.flush()
    sys.stderr.flush()

    # Configuration
    temporal_host = os.getenv("TEMPORAL_HOSTPORT", "localhost:7233")
    task_queue = os.getenv("TEMPORAL_TASK_QUEUE", "default-tenant-agent-queue")

    # Connect to Temporal with retries
    client = None
    for i in range(10):
        try:
            client = await Client.connect(temporal_host)
            logger.info(f"Connected to Temporal at {temporal_host}")
            break
        except Exception as e:
            logger.warning(f"Attempt {i+1}/10: Failed to connect to Temporal at {temporal_host}: {e}")
            await asyncio.sleep(2)
    
    if not client:
        logger.error("Could not connect to Temporal after 10 attempts. Exiting.")
        sys.exit(1)

    # Phase 3: Start HTTP server for direct execution in background thread
    # Use port 8091 instead of 8092 (bash-executor uses 8092)
    http_port = os.getenv("DIRECT_EXECUTOR_PORT", "8091")
    http_thread = threading.Thread(
        target=setup_http_server,
        kwargs={"host": "0.0.0.0", "port": int(http_port)},
        daemon=True,
    )
    http_thread.start()
    logger.info(f"[DIRECT HTTP] Background thread started on port {http_port}")

    # Initialize and run worker
    try:
        worker = Worker(
            client,
            task_queue=task_queue,
            workflows=[AgentWorkflow, HybridWorkflow],
            activities=[
                execute_code,
                reasoning_step,
                pydantic_ai_reasoning_step,
                anthropic_agents_run,  # New: Anthropic Agent SDK adapter
                invoke_skill,
                discover_mcp_tools,
                invoke_mcp_tool,
                resolve_mcp_servers,
                fetch_system_tools,
                invoke_direct_tool,
                invoke_platform_tool,  # New: Generic tool invocation for ADK/OpenAI
                invoke_agent,
                evaluate_condition,
                recall_memories,
                store_memory,
                record_cost_event,
            ],
            max_concurrent_activities=16,
        )

        logger.info(f"Starting Temporal Agent Worker on queue '{task_queue}'...")
        await worker.run()
    except Exception as e:
        logger.error(f"Worker runtime error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as e:
        print(f"CRITICAL RUNTIME ERROR: {e}")
        sys.exit(1)
