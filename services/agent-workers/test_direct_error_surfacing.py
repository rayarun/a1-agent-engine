#!/usr/bin/env python3
"""Regression: a framework error must surface as a terminal event.

Repro of the "Awaiting result..." hang: when a reasoning step returns
status=error (e.g. the follow-up LLM call is rejected by the gateway WAF),
execute_step yields {final_answer: None, continue_loop: False, error: <msg>}.
execute_iteration used to skip the falsy final_answer, take the continue_loop
branch, mark the session finished, and add NO event — so the UI streamed to
'finished' with nothing terminal and hung forever.

The contract: an errored step must (1) add an 'error' event to the session,
(2) mark the session finished, (3) propagate the error in the return dict.

Run: .venv/bin/python test_direct_error_surfacing.py
"""
import asyncio
import sys

sys.path.insert(0, ".")

from direct_agent_executor import AgentSession, DirectAgentExecutor


class _ErroringFramework:
    """Mimics execute_step returning an error status (no final_answer)."""

    async def execute_step(self, session, context):
        return {
            "final_answer": None,
            "messages_delta": [],
            "continue_loop": False,
            "error": "anthropic.PermissionDeniedError: <html>",
        }


def test_error_status_surfaces_terminal_event():
    session = AgentSession(id="s1", agent_id="a1", tenant_id="default-tenant")
    executor = DirectAgentExecutor()

    result = asyncio.run(
        executor.execute_iteration(session, {}, _ErroringFramework())
    )

    # (3) error propagated in return
    assert result["continue_loop"] is False
    assert "PermissionDeniedError" in (result.get("error") or ""), result

    # (2) session marked finished so the stream terminates
    assert session.state.get("finished") is True

    # (1) a terminal error event exists for the UI to render
    error_events = [e for e in session.events if e["type"] == "error"]
    assert error_events, f"no error event added; events={session.events}"
    assert "PermissionDeniedError" in error_events[-1].get("message", "")
    print("✅ framework error surfaces as terminal event (no hang)")


def test_direct_anthropic_execute_step_propagates_error():
    """DirectAnthropicAgent.execute_step must hand the error key upward.

    The full ReAct loop runs inside core.run_react_loop; when its terminal
    status is 'error' (the iteration-2 WAF 403), execute_step must propagate
    the error so the generic execute_iteration guard can surface it. It used
    to return final_answer=None and drop the error -> silent hang.
    """
    from direct_anthropic_agent import DirectAnthropicAgent

    agent = DirectAnthropicAgent({"model": "claude-haiku-4-5", "system_prompt": ""})

    async def fake_loop(messages, iteration_callback=None):
        return {
            "status": "error",
            "error": "anthropic.PermissionDeniedError: <html>",
            "final_answer": None,
            "tool_calls": [],
            "messages": messages,
        }

    agent.core.run_react_loop = fake_loop  # patch the loop

    session = AgentSession(id="s2", agent_id="a1", tenant_id="default-tenant")
    result = asyncio.run(agent.execute_step(session, {}))

    assert result["continue_loop"] is False
    assert "PermissionDeniedError" in (result.get("error") or ""), result
    print("✅ DirectAnthropicAgent.execute_step propagates error key")


if __name__ == "__main__":
    test_error_status_surfaces_terminal_event()
    test_direct_anthropic_execute_step_propagates_error()
    print("\nDirect error-surfacing test passed.")
