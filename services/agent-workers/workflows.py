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

import asyncio
import json
import logging
from datetime import timedelta
from typing import Optional
from temporalio import workflow
from temporalio.common import RetryPolicy


@workflow.defn
class AgentWorkflow:
    def __init__(self):
        self._events: list[dict] = []
        self._hitl_decision: Optional[str] = None

    @workflow.query
    def get_events(self) -> list[dict]:
        return self._events

    def _emit(self, event: dict) -> None:
        self._events.append(event)

    @workflow.signal(name="hitl_response")
    async def hitl_response(self, data: dict) -> None:
        self._hitl_decision = data.get("decision", "denied")

    @workflow.run
    async def run(self, request: dict) -> str:
        agent_id = request.get("agent_id", "unknown")
        tenant_id = request.get("tenant_id", "default-tenant")
        prompt = request.get("prompt") or request.get("payload", {}).get("prompt", "Hello")

        # Log for debugging
        workflow.logger.info(f"[WORKFLOW] agent_id={agent_id}, checking if manifest-assistant-system: {agent_id == 'manifest-assistant-system'}")

        manifest = request.get("manifest") or {}
        workflow.logger.info(f"[WORKFLOW] manifest keys: {list(manifest.keys())}, has_model={('model' in manifest)}, model_value={manifest.get('model', 'NOT PROVIDED')}")
        system_prompt = manifest.get("system_prompt") or "You are a helpful assistant with code execution capabilities."
        model = manifest.get("model") or request.get("model", "mock-gpt-4o")
        workflow.logger.info(f"[WORKFLOW] resolved model={model}, system_prompt_len={len(system_prompt)}")
        max_iterations = int(manifest.get("max_iterations") or 5)
        skills = manifest.get("skills") or []

        # 1. Start recall_memories as non-blocking handle
        recall_handle = workflow.start_activity(
            "recall_memories",
            args=[prompt, agent_id],
            start_to_close_timeout=timedelta(seconds=10),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )

        # Discover MCP tools: merge global + tenant + explicit servers
        explicit_mcp_servers = manifest.get("mcp_servers") or []

        # Resolve all applicable MCP servers (global + tenant + explicit)
        all_mcp_servers = await workflow.execute_activity(
            "resolve_mcp_servers",
            args=[tenant_id, explicit_mcp_servers],
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )

        # Discover MCP tool definitions
        mcp_tool_defs = []
        if all_mcp_servers:
            try:
                discovered = await workflow.execute_activity(
                    "discover_mcp_tools",
                    args=[all_mcp_servers, tenant_id],
                    start_to_close_timeout=timedelta(seconds=30),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )
                # Convert to MCPToolDefinition dicts (with metadata preserved)
                for tool in discovered:
                    mcp_tool_defs.append(tool)
            except Exception as e:
                workflow.logger.warning(f"MCP tool discovery failed: {e}")

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ]

        # Await recall result and patch system prompt if memories found
        past_memories = await recall_handle
        if past_memories:
            system_prompt += "\n\nPast findings/memories:\n- " + "\n- ".join(past_memories)
            messages[0] = {"role": "system", "content": system_prompt}

        self._emit({"type": "thinking", "content": f"Starting reasoning for: {prompt[:80]}"})

        # Extract direct tools from manifest
        direct_tools = manifest.get("tools") or []

        # Fetch system tools (auto-injected for all agents)
        system_tools = await workflow.execute_activity(
            "fetch_system_tools",
            args=[tenant_id],
            start_to_close_timeout=timedelta(seconds=15),
            retry_policy=RetryPolicy(maximum_attempts=2),
        )

        # Build agent context
        agent_context = {
            "agent_id": agent_id,
            "tenant_id": tenant_id,
            "prompt": prompt,
            "model": model,
            "max_iterations": max_iterations,
            "system_prompt": system_prompt,
            "skills": skills,
            "tools": direct_tools,
            "system_tools": system_tools,
            "mcp_servers": explicit_mcp_servers,
        }

        # 2. ReAct reasoning loop
        final_answer = None
        total_tokens_in = 0
        total_tokens_out = 0

        # Get framework from manifest (default to pydantic-ai for backward compatibility)
        framework = manifest.get("framework", "pydantic-ai")
        workflow.logger.info(f"Using framework: {framework}")

        for i in range(max_iterations):
            workflow.logger.info(f"Iteration {i + 1}/{max_iterations}")

            # Framework-based dispatch
            if framework == "pydantic-ai":
                # PydanticAI approach (activity-contained)
                try:
                    with open("/tmp/workflow_debug.log", "a") as f:
                        f.write(f"[WORKFLOW] Entering PydanticAI branch, iteration {i+1}\n")
                        f.flush()
                except:
                    pass

                decision = await workflow.execute_activity(
                    "pydantic_ai_reasoning_step",
                    args=[agent_context, messages, mcp_tool_defs],
                    start_to_close_timeout=timedelta(seconds=60),
                    retry_policy=RetryPolicy(
                        maximum_attempts=3,
                        non_retryable_error_types=["BadRequestError"],
                    ),
                )

            elif framework == "anthropic-agents":
                # Anthropic Agent SDK approach (activity-contained manual ReAct loop)
                decision = await workflow.execute_activity(
                    "anthropic_agents_run",
                    args=[agent_context, messages],
                    start_to_close_timeout=timedelta(seconds=300),
                    retry_policy=RetryPolicy(maximum_attempts=2),
                )

            elif framework == "google-adk":
                # Google ADK approach (workflow-native with Temporal plugin)
                # TODO: Phase 3 - implement builder + runner.run_async() integration
                workflow.logger.warning("Google ADK framework stub (Phase 3)")
                decision = {
                    "final_answer": "Google ADK framework not fully implemented yet (Phase 3)",
                    "tool_calls": [],
                    "messages_delta": [],
                    "continue_loop": False,
                    "hitl_pending": False,
                    "tokens_in": 0,
                    "tokens_out": 0,
                }

            elif framework == "openai-agents":
                # OpenAI Agents SDK approach (workflow-native with Temporal plugin)
                # TODO: Phase 3 - implement builder + Runner.run() integration
                workflow.logger.warning("OpenAI Agents framework stub (Phase 3)")
                decision = {
                    "final_answer": "OpenAI Agents framework not fully implemented yet (Phase 3)",
                    "tool_calls": [],
                    "messages_delta": [],
                    "continue_loop": False,
                    "hitl_pending": False,
                    "tokens_in": 0,
                    "tokens_out": 0,
                }

            else:
                # Unknown framework
                workflow.logger.error(f"Unknown framework: {framework}")
                final_answer = f"Unknown agent framework: {framework}"
                break

            # Extract decision fields (common across all frameworks)
            final_answer = decision.get("final_answer")
            tool_calls = decision.get("tool_calls") or []
            continue_loop = bool(decision.get("continue_loop", False))

            # Accumulate token usage for cost tracking
            tokens_in = decision.get("tokens_in", 0)
            tokens_out = decision.get("tokens_out", 0)
            if isinstance(tokens_in, int):
                total_tokens_in += tokens_in
            if isinstance(tokens_out, int):
                total_tokens_out += tokens_out

            # DEBUG: Log the full decision
            workflow.logger.info(f"[WORKFLOW] Decision from {framework}: keys={list(decision.keys())}, hitl_pending={decision.get('hitl_pending')}")

            # Emit decision state
            if decision.get("reasoning"):
                self._emit({"type": "thinking", "content": decision["reasoning"]})

            # Process tool calls (routing handled by each framework internally)
            if tool_calls and isinstance(tool_calls, list):
                for tc in tool_calls:
                    if isinstance(tc, dict):
                        tool_name = tc.get("name", "unknown")
                        tool_args = tc.get("arguments", {})
                        event = {
                            "type": "tool_call",
                            "tool_name": tool_name,
                            "tool_args": tool_args
                        }
                        if tc.get("result") is not None:
                            event["tool_result"] = tc.get("result")
                        self._emit(event)

            # Update messages with the full history from the activity (applies to all frameworks)
            messages_delta = decision.get("messages_delta")
            if isinstance(messages_delta, list) and messages_delta:
                workflow.logger.info(f"[WORKFLOW DEBUG] messages_delta count: {len(messages_delta)}")
                messages = messages_delta
                workflow.logger.info(f"[WORKFLOW DEBUG] messages updated to: {len(messages)} messages")
                for idx, m in enumerate(messages):
                    workflow.logger.info(f"[WORKFLOW DEBUG]   messages[{idx}]: role={m.get('role') if isinstance(m, dict) else 'unknown'}")

            # Check for HITL approval pending
            if decision.get("hitl_pending"):
                approval_id = decision.get("hitl_approval_id", "")
                h_tool_name = decision.get("hitl_tool_name", "")
                h_tool_args = decision.get("hitl_tool_args", {})

                workflow.logger.info(f"[HITL WORKFLOW] approval_id='{approval_id}', tool_name='{h_tool_name}', has_args={bool(h_tool_args)}")

                # Log to file for debugging
                try:
                    with open("/tmp/hitl_debug.log", "a") as f:
                        f.write(f"[HITL] Emitting approval event: approval_id={approval_id}, tool={h_tool_name}\n")
                        f.flush()
                except:
                    pass

                approval_event = {
                    "type": "approval",
                    "approval_id": approval_id,
                    "tool_name": h_tool_name,
                    "tool_args": h_tool_args,
                    "reason": f"Tool '{h_tool_name}' requires human approval before execution",
                }

                workflow.logger.info(f"[HITL] Event dict before emit: {list(approval_event.keys())}, has approval_id key: {'approval_id' in approval_event}, approval_id value: {approval_event.get('approval_id')}")

                self._emit(approval_event)

                workflow.logger.info(f"[HITL] Events list after emit: {len(self._events)} events, last event keys: {list(self._events[-1].keys()) if self._events else 'N/A'}")

                # Log after emit
                try:
                    with open("/tmp/hitl_debug.log", "a") as f:
                        f.write(f"[HITL] Events list now has {len(self._events)} events\n")
                        f.write(f"[HITL] Last event: {json.dumps(self._events[-1]) if self._events else 'N/A'}\n")
                        f.flush()
                except:
                    pass

                self._hitl_decision = None
                try:
                    await workflow.wait_condition(
                        lambda: self._hitl_decision is not None,
                        timeout=timedelta(minutes=5)
                    )
                except asyncio.TimeoutError:
                    final_answer = f"Approval timeout: '{h_tool_name}' was not reviewed within 5 minutes."
                    break

                if self._hitl_decision == "approved":
                    agent_context["approved_hitl_tools"] = {h_tool_name: approval_id}
                    # Don't append approval message to messages - the activity handles execution internally
                    # Adding a user message here creates consecutive user messages, breaking Anthropic API format
                    continue_loop = True
                    final_answer = None
                else:
                    final_answer = f"Execution of '{h_tool_name}' was denied by the operator."
                    break

            # Check if we should stop
            if final_answer or not continue_loop:
                break

        if not final_answer:
            final_answer = "Exceeded max reasoning iterations without a conclusion."

        self._emit({"type": "text", "content": final_answer})
        self._emit({"type": "done"})

        # 3. Fire-and-forget record_cost_event (start without awaiting)
        workflow.logger.info(f"Firing record_cost_event: tenant_id={tenant_id}, agent_id={agent_id}, tokens_in={total_tokens_in}, tokens_out={total_tokens_out}")
        workflow.start_activity(
            "record_cost_event",
            args=[tenant_id, agent_id, total_tokens_in, total_tokens_out, 0],
            start_to_close_timeout=timedelta(seconds=10),
        )

        # 4. Fire-and-forget store_memory (start without awaiting)
        workflow.start_activity(
            "store_memory",
            args=[f"Observation for '{prompt}': {final_answer}", agent_id],
            start_to_close_timeout=timedelta(seconds=10),
        )

        return f"Agent {agent_id} completed: {final_answer}"


def _execute_code_tool_def() -> dict:
    return {
        "type": "function",
        "function": {
            "name": "execute_code",
            "description": "Run Python code in a secure sandbox and return stdout.",
            "parameters": {
                "type": "object",
                "properties": {
                    "code": {"type": "string", "description": "Python code to execute."}
                },
                "required": ["code"],
            },
        },
    }


def _skill_tool_def(skill_name: str) -> dict:
    # Sanitize tool name: replace spaces and special chars with underscores
    sanitized_name = "".join(c if c.isalnum() or c in "-_" else "_" for c in skill_name)
    return {
        "type": "function",
        "function": {
            "name": sanitized_name,
            "description": f"Invoke the '{skill_name}' skill.",
            "parameters": {
                "type": "object",
                "properties": {
                    "args": {"type": "object", "description": "Arguments to pass to the skill."}
                },
                "required": [],
            },
        },
    }


@workflow.defn
class HybridWorkflow:
    """Executes declarative YAML-defined workflows with task, agent, and HITL steps."""

    def __init__(self):
        self._events: list[dict] = []
        self._hitl_decisions: dict[str, dict] = {}

    @workflow.query
    def get_events(self) -> list[dict]:
        return self._events

    @workflow.signal(name="hitl_decision")
    async def hitl_decision(self, decision: dict) -> None:
        step_id = decision.get("step_id")
        if step_id:
            self._hitl_decisions[step_id] = decision

    def _emit(self, event: dict) -> None:
        self._events.append(event)

    @workflow.run
    async def run(self, request: dict) -> str:
        """Execute a hybrid workflow defined in YAML."""
        definition = request.get("definition", {})
        inputs = request.get("inputs", {})
        tenant_id = request.get("tenant_id", "default-tenant")
        workflow_id = request.get("workflow_id", "unknown")

        workflow.logger.info(f"Starting HybridWorkflow {workflow_id}")
        self._emit({"type": "workflow_start", "workflow_id": workflow_id})

        context = {
            "inputs": inputs,
            "steps": {},
            "tenant_id": tenant_id,
        }

        steps = definition.get("steps", [])

        try:
            for step in steps:
                step_id = step.get("id")
                step_type = step.get("type", "task")

                workflow.logger.info(f"Executing step {step_id} of type {step_type}")
                self._emit({"type": "step_start", "step_id": step_id, "step_type": step_type})

                try:
                    result = await self._execute_step(step, context)
                    context["steps"][step_id] = {"status": "completed", "output": result}
                    self._emit({"type": "step_complete", "step_id": step_id, "output": result})
                except Exception as e:
                    workflow.logger.error(f"Step {step_id} failed: {e}")
                    context["steps"][step_id] = {"status": "failed", "error": str(e)}
                    self._emit({"type": "step_failed", "step_id": step_id, "error": str(e)})

                    # Check on_failure behavior
                    on_failure = step.get("on_failure", "abort")
                    if on_failure == "abort":
                        raise Exception(f"Step {step_id} failed: {e}")
                    elif on_failure == "continue":
                        continue

            self._emit({"type": "workflow_complete", "result": context["steps"]})
            return json.dumps({"status": "completed", "steps": context["steps"]})

        except Exception as e:
            workflow.logger.error(f"Workflow failed: {e}")
            self._emit({"type": "workflow_failed", "error": str(e)})
            return json.dumps({"status": "failed", "error": str(e)})

    async def _execute_step(self, step: dict, context: dict) -> dict:
        """Execute a single workflow step."""
        step_id = step.get("id")
        step_type = step.get("type", "task")
        tenant_id = context["tenant_id"]

        if step_type == "task":
            skill_name = step.get("skill_name")
            args = step.get("args", {})
            return await workflow.execute_activity(
                "invoke_skill",
                args=[skill_name, args, "", tenant_id],
                start_to_close_timeout=timedelta(minutes=5),
            )

        elif step_type == "agent":
            agent_id = step.get("agent_id")
            prompt = step.get("input_mapping", {}).get("prompt", "")
            return await workflow.execute_activity(
                "invoke_agent",
                args=[agent_id, prompt, tenant_id],
                start_to_close_timeout=timedelta(minutes=15),
            )

        elif step_type == "hitl":
            prompt = step.get("prompt", "Approve this action?")
            if step_id:
                self._hitl_decisions.pop(step_id, None)

                # Wait for HITL decision (with timeout)
                while step_id not in self._hitl_decisions:
                    await asyncio.sleep(1)
                    # TODO: implement proper timeout with workflow.wait_condition

                decision = self._hitl_decisions[step_id]
                return {
                    "approved": decision.get("approved", False),
                    "approved_by": decision.get("approved_by"),
                    "notes": decision.get("notes"),
                }
            return {"approved": False, "error": "No step_id provided"}

        elif step_type == "parallel":
            parallel_steps = step.get("parallel_steps", [])
            results = {}
            for sub_step in parallel_steps:
                sub_id = sub_step.get("id")
                result = await self._execute_step(sub_step, context)
                results[sub_id] = result
            return results

        else:
            raise ValueError(f"Unknown step type: {step_type}")
