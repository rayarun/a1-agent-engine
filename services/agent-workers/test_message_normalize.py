#!/usr/bin/env python3
"""Tests for Anthropic message-history conformance.

Reproduces the HITL multi-tool 400: an assistant turn with two tool_use blocks
whose results were appended as two separate user messages. The API rejects the
second tool_result because its 'previous message' is a user message, not the
assistant tool_use. merge_consecutive_tool_results() must coalesce them.

Run: .venv/bin/python test_message_normalize.py
"""
import sys

sys.path.insert(0, ".")

from message_normalize import merge_consecutive_tool_results


def _tool_use(id_, name="bash"):
    return {"type": "tool_use", "id": id_, "name": name, "input": {}}


def _tool_result(id_, text):
    return {"type": "tool_result", "tool_use_id": id_, "content": text}


def test_merges_split_tool_results_for_one_turn():
    # The exact malformed shape from the HITL two-bash repro.
    messages = [
        {"role": "user", "content": "run two bash commands"},
        {"role": "assistant", "content": [_tool_use("A"), _tool_use("B")]},
        {"role": "user", "content": [_tool_result("A", "ra")]},
        {"role": "user", "content": [_tool_result("B", "rb")]},
    ]
    out = merge_consecutive_tool_results(messages)

    assert len(out) == 3, f"expected 3 messages after merge, got {len(out)}"
    assert out[1]["role"] == "assistant"
    # Both results live in ONE user message, in order, right after the assistant.
    assert out[2]["role"] == "user"
    ids = [b["tool_use_id"] for b in out[2]["content"]]
    assert ids == ["A", "B"], ids
    print("✅ merges split tool_results for a single assistant turn")


def test_merges_three_consecutive():
    messages = [
        {"role": "assistant", "content": [_tool_use("A"), _tool_use("B"), _tool_use("C")]},
        {"role": "user", "content": [_tool_result("A", "1")]},
        {"role": "user", "content": [_tool_result("B", "2")]},
        {"role": "user", "content": [_tool_result("C", "3")]},
    ]
    out = merge_consecutive_tool_results(messages)
    assert len(out) == 2
    assert [b["tool_use_id"] for b in out[1]["content"]] == ["A", "B", "C"]
    print("✅ merges three consecutive tool_result messages")


def test_does_not_merge_across_assistant_turns():
    # Separate assistant turns must stay separate — each result follows its turn.
    messages = [
        {"role": "assistant", "content": [_tool_use("A")]},
        {"role": "user", "content": [_tool_result("A", "ra")]},
        {"role": "assistant", "content": [_tool_use("B")]},
        {"role": "user", "content": [_tool_result("B", "rb")]},
    ]
    out = merge_consecutive_tool_results(messages)
    assert len(out) == 4, f"single-tool turns must not be merged, got {len(out)}"
    print("✅ does not merge across distinct assistant turns")


def test_leaves_plain_conversation_untouched():
    messages = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
        {"role": "user", "content": "bye"},
    ]
    out = merge_consecutive_tool_results(messages)
    assert out == messages
    print("✅ plain text conversation untouched")


def test_does_not_mutate_input():
    messages = [
        {"role": "assistant", "content": [_tool_use("A"), _tool_use("B")]},
        {"role": "user", "content": [_tool_result("A", "ra")]},
        {"role": "user", "content": [_tool_result("B", "rb")]},
    ]
    before = len(messages)
    merge_consecutive_tool_results(messages)
    assert len(messages) == before, "input list must not be mutated"
    print("✅ input not mutated")


if __name__ == "__main__":
    test_merges_split_tool_results_for_one_turn()
    test_merges_three_consecutive()
    test_does_not_merge_across_assistant_turns()
    test_leaves_plain_conversation_untouched()
    test_does_not_mutate_input()
    print("\nMessage normalize tests passed.")
