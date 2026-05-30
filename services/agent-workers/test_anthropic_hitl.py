#!/usr/bin/env python3
"""Unit test: Anthropic core must pause the ReAct loop when a tool returns the
HITL approval marker (__HITL_PENDING__), instead of feeding it back to the LLM
and looping to max iterations.

Run: .venv/bin/python test_anthropic_hitl.py
"""
import asyncio
import sys
from types import SimpleNamespace

sys.path.insert(0, ".")

from anthropic_agent_core import AnthropicAgentCore


class _FakeToolExecutor:
    def __init__(self, ret):
        self.ret = ret
        self.calls = []

    async def invoke(self, name, inp):
        self.calls.append((name, inp))
        return self.ret


class _FakeMessages:
    """Always returns a single tool_use response (the model 'wants' bash)."""

    async def create(self, **kw):
        block = SimpleNamespace(type="tool_use", name="bash",
                                input={"command": "echo hi"}, id="toolu_1")
        usage = SimpleNamespace(input_tokens=5, output_tokens=5)
        return SimpleNamespace(stop_reason="tool_use", content=[block], usage=usage)


def _make_core(tool_ret):
    core = AnthropicAgentCore.__new__(AnthropicAgentCore)  # skip real client init
    core.context = {}
    core.tool_executor = _FakeToolExecutor(tool_ret)
    core.agent_id = "t"
    core.tenant_id = "t"
    core.model = "m"
    core.system_prompt = "s"
    core.max_iterations = 5
    core.client = SimpleNamespace(messages=_FakeMessages())
    return core


def test_hitl_marker_pauses_loop():
    marker = '__HITL_PENDING__::appr-123::bash::{"command": "echo hi"}'
    core = _make_core(marker)
    res = asyncio.run(core.run_react_loop([{"role": "user", "content": "run bash"}]))

    assert res["status"] == "hitl_pending", f"expected hitl_pending, got {res['status']}"
    assert res["hitl_approval_id"] == "appr-123", res.get("hitl_approval_id")
    assert res["hitl_tool_name"] == "bash", res.get("hitl_tool_name")
    assert res["hitl_tool_args"] == {"command": "echo hi"}, res.get("hitl_tool_args")
    # The tool must be invoked exactly once (no looping) ...
    assert len(core.tool_executor.calls) == 1, core.tool_executor.calls
    # ... and the assistant tool_use block must be preserved for the resume path.
    assert any(m.get("role") == "assistant" for m in res["messages"]), res["messages"]
    print("✅ HITL marker pauses loop with parsed approval info (no looping)")


if __name__ == "__main__":
    test_hitl_marker_pauses_loop()
    print("\nAnthropic HITL test passed.")
