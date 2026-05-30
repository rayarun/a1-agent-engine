#!/usr/bin/env python3
"""Tests for the shared AgentDecision post-processor.

finalize_decision() is the cross-cutting normalizer every framework's
reasoning loop runs its raw decision through before returning, so the
governed contract is guaranteed in one place instead of being hand-rolled
(and drifting) per framework.

Run: .venv/bin/python test_decision_postprocess.py
"""
import sys

sys.path.insert(0, ".")

from decision_postprocess import REQUIRED_KEYS, finalize_decision


def test_fills_required_keys_with_defaults():
    d = finalize_decision({})
    for k in REQUIRED_KEYS:
        assert k in d, f"missing {k}"
    assert d["final_answer"] is None
    assert d["tool_calls"] == []
    assert d["messages_delta"] == []
    assert d["continue_loop"] is False
    assert d["hitl_pending"] is False
    assert d["tokens_in"] == 0 and d["tokens_out"] == 0
    print("✅ fills required keys with defaults")


def test_coerces_types():
    d = finalize_decision({"tool_calls": None, "messages_delta": None,
                           "continue_loop": 1, "tokens_in": None, "tokens_out": "x"})
    assert d["tool_calls"] == [] and d["messages_delta"] == []
    assert d["continue_loop"] is True
    assert d["tokens_in"] == 0 and d["tokens_out"] == 0  # bad token values -> 0
    print("✅ coerces types safely")


def test_enforces_hitl_invariant():
    # The loop-forever footgun: a pending approval must pause, never continue
    # or finalize — even if the framework mistakenly set those.
    d = finalize_decision({"hitl_pending": True, "continue_loop": True,
                           "final_answer": "ignore me", "hitl_approval_id": "a1"})
    assert d["hitl_pending"] is True
    assert d["continue_loop"] is False
    assert d["final_answer"] is None
    assert d["hitl_approval_id"] == "a1"  # passthrough preserved
    print("✅ enforces HITL invariant (pending -> no continue, no final_answer)")


def test_preserves_valid_decision():
    d = finalize_decision({"final_answer": "done", "tool_calls": [{"name": "x"}],
                           "continue_loop": False, "tokens_in": 5, "tokens_out": 7})
    assert d["final_answer"] == "done"
    assert d["tool_calls"] == [{"name": "x"}]
    assert d["tokens_in"] == 5 and d["tokens_out"] == 7
    print("✅ preserves a valid decision")


def test_none_input():
    d = finalize_decision(None)
    assert d["final_answer"] is None and d["continue_loop"] is False
    print("✅ None input -> safe empty decision")


if __name__ == "__main__":
    test_fills_required_keys_with_defaults()
    test_coerces_types()
    test_enforces_hitl_invariant()
    test_preserves_valid_decision()
    test_none_input()
    print("\nDecision post-processor tests passed.")
