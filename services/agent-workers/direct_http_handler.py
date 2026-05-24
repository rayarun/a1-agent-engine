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

"""
HTTP handler for direct (non-Temporal) agent execution.
Exposes Flask REST API for agents running in execution_mode="direct".
"""

import asyncio
import logging
import os
from concurrent.futures import ThreadPoolExecutor

import httpx
from flask import Flask, request, jsonify, Response

from direct_agent_executor import DirectAgentExecutor
from direct_anthropic_agent import DirectAnthropicAgent

logger = logging.getLogger(__name__)

app = Flask(__name__)
executor = DirectAgentExecutor(max_sessions=100)
thread_pool = ThreadPoolExecutor(max_workers=10)


def run_async_in_thread(coro):
    """Run async code in a background thread with its own event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


async def fetch_system_tools(tenant_id: str) -> list[dict]:
    """Fetch system tools from tool-registry."""
    try:
        tool_registry_url = os.getenv("TOOL_REGISTRY_URL", "http://tool-registry:8086")
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{tool_registry_url}/api/v1/tools?include_system=true&status=approved",
                headers={"X-Tenant-ID": tenant_id}
            )
            if resp.status_code == 200:
                tools = resp.json()
                system_tools = [t for t in tools if t.get("scope") == "system"]
                logger.info(f"Fetched {len(system_tools)} system tools for tenant {tenant_id}")
                return system_tools
            else:
                logger.error(f"Tool registry returned status {resp.status_code}")
    except Exception as e:
        logger.error(f"Failed to fetch system tools: {e}")
    return []


@app.before_request
def log_request():
    """Log incoming requests."""
    logger.info(f"[HTTP] {request.method} {request.path}")


@app.route("/api/v1/agents/execute-direct", methods=["POST"])
def execute_direct():
    """
    Start or resume direct agent execution.

    Request headers:
      X-Tenant-ID: Tenant identifier (required)

    Request body:
    {
      "agent_id": "agent-name",
      "message": "User message",
      "manifest": { "model", "system_prompt", "max_iterations", ... },
      "session_id": "optional-session-id-to-resume"
    }

    Response:
    {
      "session_id": "uuid",
      "events": [...],
      "finished": boolean,
      "error": "error message or null"
    }
    """
    try:
        # Validate X-Tenant-ID header
        tenant_id = request.headers.get("X-Tenant-ID")
        if not tenant_id:
            return jsonify({"error": "Missing X-Tenant-ID header"}), 400

        # Parse request body
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid request body"}), 400

        agent_id = data.get("agent_id")
        message = data.get("message")
        manifest = data.get("manifest", {})
        session_id = data.get("session_id")

        if not agent_id or not message:
            return jsonify({"error": "Missing agent_id or message"}), 400

        # Get or create session
        session = executor.get_or_create_session(agent_id, tenant_id, session_id)
        session.messages.append({"role": "user", "content": message})
        session.add_event("user_message", content=message)

        # Fetch system tools in thread pool
        try:
            logger.info(f"[HTTP] Fetching system tools for tenant {tenant_id}")
            system_tools = thread_pool.submit(
                run_async_in_thread, fetch_system_tools(tenant_id)
            ).result(timeout=10)
            logger.info(f"[HTTP] Fetched {len(system_tools)} system tools")
        except Exception as e:
            logger.error(f"[HTTP] Failed to fetch system tools: {e}")
            system_tools = []

        # Build context for agent execution
        context = {
            "agent_id": agent_id,
            "tenant_id": tenant_id,
            "model": manifest.get("model", "claude-opus-4-7"),
            "system_prompt": manifest.get(
                "system_prompt", "You are a helpful assistant"
            ),
            "max_iterations": manifest.get("max_iterations", 5),
            "system_tools": system_tools,
            "tools": manifest.get("tools", []),
        }

        # Create agent
        agent = DirectAnthropicAgent(context)

        # Execute agent loop until finished
        result = None
        max_iterations_val = context.get("max_iterations", 5)
        # Ensure max_iterations is an integer
        if isinstance(max_iterations_val, int):
            max_iterations = max_iterations_val
        elif isinstance(max_iterations_val, str):
            max_iterations = int(max_iterations_val)
        else:
            max_iterations = 5
        iteration_count = 0

        def execute_iteration_in_thread():
            return run_async_in_thread(
                executor.execute_iteration(session, context, agent)
            )

        try:
            # Loop until agent is finished or max iterations reached
            while iteration_count < max_iterations:
                iteration_count += 1
                logger.info(f"[HTTP] Executing iteration {iteration_count}/{max_iterations}")
                result = thread_pool.submit(execute_iteration_in_thread).result(timeout=120)

                # If agent finished, break
                if not result.get("continue_loop", False):
                    logger.info(f"[HTTP] Agent finished after {iteration_count} iterations")
                    break

            if result and iteration_count >= max_iterations and result.get("continue_loop", False):
                session.add_event("error", message="Exceeded max iterations without completion")
                result = {
                    "session_id": session.id,
                    "events": session.get_new_events(),
                    "continue_loop": False,
                    "error": "Exceeded max iterations",
                }
        except TimeoutError:
            logger.error(f"[HTTP] Agent execution timeout on iteration {iteration_count}")
            session.add_event(
                "error", message="Agent execution timeout (2 minutes per iteration)"
            )
            result = {
                "session_id": session.id,
                "events": session.get_new_events(),
                "continue_loop": False,
                "error": "Agent execution timeout",
            }
        except Exception as e:
            logger.error(f"[HTTP] Agent execution failed: {e}")
            session.add_event("error", message=str(e))
            result = {
                "session_id": session.id,
                "events": session.get_new_events(),
                "continue_loop": False,
                "error": str(e),
            }

        # Return response
        if not result:
            result = {
                "session_id": session.id,
                "events": [],
                "continue_loop": False,
            }

        response_data = {
            "session_id": session.id,
            "events": result.get("events", []),
            "finished": not result.get("continue_loop", False),
        }
        if result.get("error"):
            response_data["error"] = result["error"]

        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Request handler error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/agents/sessions/<session_id>/events", methods=["GET"])
def get_session_events(session_id):
    """
    Poll for events from a session.

    Request headers:
      X-Tenant-ID: Tenant identifier (required)
      Accept: Set to "text/event-stream" for SSE streaming (optional)

    Query parameters:
      since_index: Return events from this index (default: 0)
      timeout: Wait up to N seconds for new events (default: 300)

    Response:
      JSON: { "events": [...] }
      SSE: text/event-stream with newline-delimited JSON events
    """
    try:
        # Validate X-Tenant-ID header
        tenant_id = request.headers.get("X-Tenant-ID")
        if not tenant_id:
            return jsonify({"error": "Missing X-Tenant-ID header"}), 400

        # Retrieve session with tenant validation
        session = executor.get_session(session_id, tenant_id)
        if not session:
            return jsonify({"error": "Session not found or expired"}), 404

        since_index = int(request.args.get("since_index", 0))

        # Check if SSE streaming requested
        if request.headers.get("Accept") == "text/event-stream":
            timeout = int(request.args.get("timeout", 300))

            def generate_sse():
                """Generate SSE stream."""

                async def stream_events_wrapper():
                    async for event_json in executor.stream_events(
                        session_id, tenant_id, timeout
                    ):
                        yield f"data: {event_json}\n\n"

                # Run async generator in thread pool
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    async_gen = stream_events_wrapper()
                    while True:
                        try:
                            chunk = loop.run_until_complete(
                                async_gen.__anext__()
                            )
                            yield chunk
                        except StopAsyncIteration:
                            break
                finally:
                    loop.close()

            return Response(generate_sse(), content_type="text/event-stream")
        else:
            # Return JSON
            events = session.get_new_events(since_index)
            return jsonify({"events": events}), 200

    except Exception as e:
        logger.error(f"Get events handler error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/agents/sessions/<session_id>", methods=["GET"])
def get_session(session_id):
    """
    Retrieve session metadata (without events).

    Request headers:
      X-Tenant-ID: Tenant identifier (required)
    """
    try:
        tenant_id = request.headers.get("X-Tenant-ID")
        if not tenant_id:
            return jsonify({"error": "Missing X-Tenant-ID header"}), 400

        session = executor.get_session(session_id, tenant_id)
        if not session:
            return jsonify({"error": "Session not found or expired"}), 404

        return (
            jsonify(
                {
                    "session_id": session.id,
                    "agent_id": session.agent_id,
                    "tenant_id": session.tenant_id,
                    "created_at": session.created_at,
                    "expires_at": session.expires_at,
                    "is_expired": session.is_expired(),
                    "message_count": len(session.messages),
                    "event_count": len(session.events),
                }
            ),
            200,
        )
    except Exception as e:
        logger.error(f"Get session handler error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return (
        jsonify(
            {
                "status": "ok",
                "service": "direct-executor",
                "active_sessions": len(executor.sessions),
            }
        ),
        200,
    )


@app.errorhandler(404)
def not_found(_):
    """Handle 404 errors."""
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(500)
def internal_error(_):
    """Handle 500 errors."""
    return jsonify({"error": "Internal server error"}), 500


def setup_http_server(host="0.0.0.0", port=8092):
    """
    Start Flask HTTP server for direct execution.
    This is called in a background thread from main.py.
    """
    logger.info(f"[DIRECT HTTP] Starting server on {host}:{port}")
    try:
        app.run(host=host, port=port, debug=False, threaded=True, use_reloader=False)
    except Exception as e:
        logger.error(f"[DIRECT HTTP] Server startup failed: {e}")
