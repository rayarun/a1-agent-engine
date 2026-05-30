#!/usr/bin/env python3
"""Cross-framework conformance scaffold.

Every agent framework (Anthropic, PydanticAI, Google ADK, OpenAI Agents)
re-implements its own reasoning loop but must produce the SAME governed
AgentDecision contract. Cross-cutting features (HITL detection, required
decision fields, no-loop-on-pending) have silently diverged before — e.g.
the Anthropic path dropped the HITL marker and looped to max iterations
while PydanticAI handled it.

This suite pins the *shared contract* that every framework adapter must
satisfy, so a new framework (or a regression in an existing one) is caught
mechanically instead of by hand in production.

Each framework exposes a small adapter implementing `decide(scenario)` that
maps a canonical scenario to its AgentDecision dict. As frameworks are wired
in, add them to FRAMEWORK_ADAPTERS. The HITL-detection invariant is proven
today via the shared codec (the actual divergence point); per-framework
adapters are TODO hooks ready to be filled.

Run: .venv/bin/python test_framework_conformance.py
"""
import sys

sys.path.insert(0, ".")

from hitl_markers import build_hitl_marker, parse_hitl_marker

# --- Canonical scenarios every framework's reasoning loop must handle ---
SCENARIOS = [
    "plain_answer",        # model answers with no tools -> final_answer set, continue_loop False
    "single_tool_call",    # one tool -> tool executed, loop continues or concludes
    "hitl_pending",        # tool returns approval marker -> pause, do NOT loop
    "max_iterations",      # never concludes -> terminates with a final answer, no infinite loop
    "tool_error",          # tool errors -> surfaced, not silently looped
]

# Required keys on every AgentDecision regardless of framework.
REQUIRED_DECISION_KEYS = {"final_answer", "tool_calls", "messages_delta", "continue_loop", "hitl_pending"}


def assert_valid_decision(decision: dict, where: str):
    missing = REQUIRED_DECISION_KEYS - set(decision.keys())
    assert not missing, f"[{where}] decision missing keys: {missing}"
    # A pending-HITL decision must NOT also tell the loop to continue.
    if decision.get("hitl_pending"):
        assert decision.get("continue_loop") is False, f"[{where}] hitl_pending must not continue_loop"
        assert decision.get("final_answer") is None, f"[{where}] hitl_pending must not set final_answer"


def test_hitl_marker_is_the_shared_divergence_point():
    """The bug class lived in marker handling; pin it centrally.

    Any framework that runs a tool result through parse_hitl_marker pauses
    correctly; any that doesn't will loop. This guards the contract used by
    all framework adapters.
    """
    marker = build_hitl_marker("appr-9", "bash", {"command": "echo hi"})
    info = parse_hitl_marker(marker)
    assert info and info["tool_name"] == "bash"
    # A normal tool result must be transparent (no false HITL pause).
    assert parse_hitl_marker('{"output": "hi"}') is None
    print("✅ HITL marker is centrally handled (shared by all frameworks)")


def test_decision_contract_validator():
    # Good decisions
    assert_valid_decision(
        {"final_answer": "hi", "tool_calls": [], "messages_delta": [], "continue_loop": False, "hitl_pending": False},
        "plain_answer",
    )
    assert_valid_decision(
        {"final_answer": None, "tool_calls": [], "messages_delta": [], "continue_loop": False, "hitl_pending": True},
        "hitl_pending",
    )
    # Bad: pending + continue_loop is the loop-forever footgun
    try:
        assert_valid_decision(
            {"final_answer": None, "tool_calls": [], "messages_delta": [], "continue_loop": True, "hitl_pending": True},
            "bad",
        )
        raise SystemExit("validator should have rejected pending+continue")
    except AssertionError:
        pass
    print("✅ decision-contract validator catches the loop-forever footgun")


# --- Framework adapters -------------------------------------------------
# Fill these in to run all SCENARIOS against each framework's real decision
# builder (e.g. anthropic_agent_core.run_react_loop with a fake client/tool
# executor; pydantic_ai convert_response_to_decision with a fake response).
# Wiring deferred so this scaffold lands without a live LLM; the contract
# above is what each adapter must satisfy.
FRAMEWORK_ADAPTERS = {
    # "anthropic": anthropic_adapter,
    # "pydantic-ai": pydantic_adapter,
    # "google-adk": adk_adapter,        # Phase 3
    # "openai-agents": openai_adapter,  # Phase 3
}


def test_all_adapters_satisfy_contract():
    if not FRAMEWORK_ADAPTERS:
        print("⚠️  no framework adapters wired yet — contract validator ready (see FRAMEWORK_ADAPTERS)")
        return
    for name, adapter in FRAMEWORK_ADAPTERS.items():
        for scenario in SCENARIOS:
            decision = adapter.decide(scenario)
            assert_valid_decision(decision, f"{name}/{scenario}")
    print("✅ all wired framework adapters satisfy the decision contract")


if __name__ == "__main__":
    test_hitl_marker_is_the_shared_divergence_point()
    test_decision_contract_validator()
    test_all_adapters_satisfy_contract()
    print("\nFramework conformance scaffold passed.")
