#!/usr/bin/env python3
"""Cross-framework conformance suite.

Every agent framework re-implements its own reasoning loop but must produce
the SAME governed AgentDecision contract. Cross-cutting behavior (HITL
detection, required fields, no-loop-while-pending) has silently diverged
before — the Anthropic path dropped the HITL marker and looped to max
iterations while PydanticAI handled it.

This runs the same canonical scenarios against each framework's REAL decision
builder (with fakes, no live LLM) and asserts the shared contract, so a new
framework or a regression is caught mechanically.

Run: .venv/bin/python test_framework_conformance.py
"""
import asyncio
import sys
from types import SimpleNamespace

sys.path.insert(0, ".")

from hitl_markers import build_hitl_marker

# --- Shared decision contract ------------------------------------------
# Keys the workflow loop relies on. hitl_pending is read via .get(), so it is
# optional and defaults to False — but if present-and-true it must not also
# tell the loop to continue (that is the loop-forever footgun).
REQUIRED_DECISION_KEYS = {"final_answer", "tool_calls", "messages_delta", "continue_loop"}


def assert_valid_decision(d: dict, where: str):
    missing = REQUIRED_DECISION_KEYS - set(d.keys())
    assert not missing, f"[{where}] decision missing keys: {missing}"
    if d.get("hitl_pending"):
        assert d.get("continue_loop") is False, f"[{where}] hitl_pending must not continue_loop"
        assert d.get("final_answer") is None, f"[{where}] hitl_pending must not set final_answer"


# --- Anthropic adapter: drives the real execute_step/run_react_loop -----

def _a_text(t):
    return SimpleNamespace(type="text", text=t)


def _a_tool(name="bash", inp=None, id="toolu_1"):
    return SimpleNamespace(type="tool_use", name=name, input=inp or {"command": "echo hi"}, id=id)


def _a_resp(stop_reason, blocks):
    return SimpleNamespace(stop_reason=stop_reason, content=blocks,
                           usage=SimpleNamespace(input_tokens=1, output_tokens=1))


class _SeqMessages:
    def __init__(self, responses, raise_api=False):
        self._responses = list(responses)
        self._raise = raise_api

    async def create(self, **kw):
        if self._raise:
            raise RuntimeError("simulated API error")
        if self._responses:
            return self._responses.pop(0)
        return _a_resp("end_turn", [_a_text("done")])


class _ToolExec:
    def __init__(self, ret):
        self.ret = ret

    async def invoke(self, name, inp):
        return self.ret


def _anthropic_decision(responses, tool_ret='{"output":"ok"}', max_iter=3, raise_api=False):
    from anthropic_agent import AnthropicTemporalAgent
    from anthropic_agent_core import AnthropicAgentCore

    core = AnthropicAgentCore.__new__(AnthropicAgentCore)
    core.context = {}
    core.agent_id = "t"
    core.tenant_id = "t"
    core.model = "m"
    core.system_prompt = "s"
    core.max_iterations = max_iter
    core.tool_executor = _ToolExec(tool_ret)
    core.client = SimpleNamespace(messages=_SeqMessages(responses, raise_api))

    agent = AnthropicTemporalAgent.__new__(AnthropicTemporalAgent)
    agent.context = {}
    agent.approved_tool_use_ids = set()
    agent.core = core

    session = SimpleNamespace(messages=[{"role": "user", "content": "go"}])
    return asyncio.run(agent.execute_step(session, {"approved_hitl_tools": {}}))


def anthropic_adapter():
    marker = build_hitl_marker("appr-1", "bash", {"command": "echo hi"})
    return {
        "plain_answer": _anthropic_decision([_a_resp("end_turn", [_a_text("hi")])]),
        "single_tool_call": _anthropic_decision(
            [_a_resp("tool_use", [_a_tool()]), _a_resp("end_turn", [_a_text("done")])]),
        "hitl_pending": _anthropic_decision([_a_resp("tool_use", [_a_tool()])], tool_ret=marker),
        "max_iterations": _anthropic_decision([_a_resp("tool_use", [_a_tool()])] * 5, max_iter=3),
        "tool_error": _anthropic_decision([], raise_api=True),
    }


# --- PydanticAI adapter: drives the real convert_response_to_decision ---

def _p_part(kind, content="", tool_call_id=""):
    return SimpleNamespace(part_kind=kind, content=content, tool_call_id=tool_call_id)


def _p_response(output, parts):
    return SimpleNamespace(output=output, all_messages=lambda: [SimpleNamespace(parts=parts)])


def _as_dict(decision):
    return decision.model_dump() if hasattr(decision, "model_dump") else decision


def pydantic_adapter():
    from pydantic_ai_agent import convert_response_to_decision

    marker = build_hitl_marker("appr-2", "bash", {"command": "echo hi"})
    plain = asyncio.run(convert_response_to_decision(
        _p_response("hello", [_p_part("text", "hello")]), []))
    hitl = asyncio.run(convert_response_to_decision(
        _p_response("(pending)", [_p_part("tool-call", "", "tc1"), _p_part("tool-return", marker, "tc1")]), []))
    return {"plain_answer": _as_dict(plain), "hitl_pending": _as_dict(hitl)}


FRAMEWORK_ADAPTERS = {
    "anthropic": anthropic_adapter,
    "pydantic-ai": pydantic_adapter,
    # "google-adk": ...,        # Phase 3 stub
    # "openai-agents": ...,     # Phase 3 stub
}


def test_all_adapters_satisfy_contract():
    for name, adapter in FRAMEWORK_ADAPTERS.items():
        decisions = adapter()
        for scenario, decision in decisions.items():
            assert_valid_decision(decision, f"{name}/{scenario}")
        # Scenario-specific invariants where the framework provides them.
        if "hitl_pending" in decisions:
            assert decisions["hitl_pending"].get("hitl_pending") is True, f"{name}: hitl_pending scenario must pause"
        if "plain_answer" in decisions:
            assert decisions["plain_answer"].get("final_answer"), f"{name}: plain_answer must yield a final answer"
        print(f"✅ {name}: {len(decisions)} scenarios satisfy the decision contract")


if __name__ == "__main__":
    test_all_adapters_satisfy_contract()
    print("\nFramework conformance suite passed.")
