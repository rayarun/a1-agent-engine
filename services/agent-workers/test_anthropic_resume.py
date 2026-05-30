#!/usr/bin/env python3
"""Unit test: after HITL approval, an approved tool_use must be considered
"already executed" once its tool_result is present in the message history,
so the resume path does not re-execute it every workflow iteration (which
previously looped to max iterations because the in-activity set didn't
persist across Temporal activity boundaries).

Run: .venv/bin/python test_anthropic_resume.py
"""
import sys

sys.path.insert(0, ".")

from anthropic_agent import tool_use_ids_with_results


def test_detects_result_for_tool_use():
    messages = [
        {"role": "user", "content": "run bash"},
        {"role": "assistant", "content": [
            {"type": "tool_use", "name": "bash", "id": "toolu_1", "input": {"command": "echo hi"}},
        ]},
        {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "toolu_1", "content": "hi"},
        ]},
    ]
    assert tool_use_ids_with_results(messages) == {"toolu_1"}
    print("✅ detects executed tool_use via existing tool_result")


def test_no_result_yet():
    messages = [
        {"role": "assistant", "content": [
            {"type": "tool_use", "name": "bash", "id": "toolu_1", "input": {}},
        ]},
    ]
    assert tool_use_ids_with_results(messages) == set()
    print("✅ no tool_result -> empty set (tool still needs executing)")


def test_ignores_non_tool_result_and_strings():
    messages = [
        {"role": "user", "content": "plain string content"},
        {"role": "assistant", "content": [{"type": "text", "text": "hello"}]},
        {"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": "toolu_a", "content": "x"},
            {"type": "tool_result", "tool_use_id": "toolu_b", "content": "y"},
        ]},
    ]
    assert tool_use_ids_with_results(messages) == {"toolu_a", "toolu_b"}
    print("✅ handles mixed/string content, collects all result ids")


if __name__ == "__main__":
    test_detects_result_for_tool_use()
    test_no_result_yet()
    test_ignores_non_tool_result_and_strings()
    print("\nAnthropic resume helper tests passed.")
