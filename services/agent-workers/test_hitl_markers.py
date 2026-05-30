#!/usr/bin/env python3
"""Tests for the shared HITL marker codec.

The __HITL_PENDING__ sentinel is the contract between the tool bridge (which
emits it when a tool needs human approval) and every framework's reasoning
loop (which must detect it and pause). Centralizing build+parse here removes
the per-framework duplication that previously let the Anthropic path silently
drop the marker and loop to max iterations.

Run: .venv/bin/python test_hitl_markers.py
"""
import sys

sys.path.insert(0, ".")

from hitl_markers import HITL_MARKER_PREFIX, build_hitl_marker, parse_hitl_marker


def test_roundtrip():
    marker = build_hitl_marker("appr-1", "bash", {"command": "echo hi"})
    assert marker.startswith(HITL_MARKER_PREFIX)
    info = parse_hitl_marker(marker)
    assert info == {"approval_id": "appr-1", "tool_name": "bash", "tool_args": {"command": "echo hi"}}
    print("✅ build/parse round-trip")


def test_parse_non_marker_returns_none():
    assert parse_hitl_marker("just a normal tool result") is None
    assert parse_hitl_marker("") is None
    assert parse_hitl_marker(None) is None
    assert parse_hitl_marker({"not": "a string"}) is None
    print("✅ non-markers return None")


def test_parse_empty_args():
    info = parse_hitl_marker(build_hitl_marker("a", "kg-search", {}))
    assert info["tool_args"] == {}
    print("✅ empty args")


def test_parse_malformed_args_degrades_gracefully():
    # Manually corrupt the json args segment; must not raise.
    bad = HITL_MARKER_PREFIX + "a::bash::{not json"
    info = parse_hitl_marker(bad)
    assert info is not None and info["approval_id"] == "a" and info["tool_args"] == {}
    print("✅ malformed args -> empty dict, no raise")


def test_parse_too_few_segments():
    assert parse_hitl_marker(HITL_MARKER_PREFIX + "only-one") is None
    print("✅ too few segments -> None")


if __name__ == "__main__":
    test_roundtrip()
    test_parse_non_marker_returns_none()
    test_parse_empty_args()
    test_parse_malformed_args_degrades_gracefully()
    test_parse_too_few_segments()
    print("\nHITL marker codec tests passed.")
