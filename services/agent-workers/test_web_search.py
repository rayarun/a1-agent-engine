#!/usr/bin/env python3
"""Unit tests for DuckDuckGo web_search payload parsing.

Run: .venv/bin/python test_web_search.py
"""
import json
import sys

sys.path.insert(0, ".")

from direct_tools_executor import parse_ddg_payload


def test_parse_abstract():
    data = {"AbstractText": "Karnataka is a state in India.",
            "AbstractURL": "http://example.com/karnataka", "Heading": "Karnataka"}
    results = parse_ddg_payload(data)
    assert len(results) >= 1, results
    assert results[0]["snippet"] == "Karnataka is a state in India."
    assert results[0]["url"] == "http://example.com/karnataka"
    print("✅ parse abstract")


def test_parse_answer():
    data = {"Answer": "42", "AnswerType": "calc"}
    results = parse_ddg_payload(data)
    assert any(r["snippet"] == "42" for r in results), results
    print("✅ parse answer")


def test_parse_related_topics_flat_and_nested():
    data = {"RelatedTopics": [
        {"Text": "Topic one", "FirstURL": "u1"},
        {"Name": "Group", "Topics": [{"Text": "Nested topic", "FirstURL": "u2"}]},
    ]}
    results = parse_ddg_payload(data)
    snippets = [r["snippet"] for r in results]
    assert "Topic one" in snippets, snippets
    assert "Nested topic" in snippets, snippets
    print("✅ parse related topics (flat + nested)")


def test_parse_results_field():
    data = {"Results": [{"Title": "Off site", "FirstURL": "ru", "Text": "rt"}]}
    results = parse_ddg_payload(data)
    assert results[0]["url"] == "ru" and results[0]["snippet"] == "rt", results
    print("✅ parse Results field")


def test_parse_empty_returns_empty_list():
    assert parse_ddg_payload({}) == []
    assert parse_ddg_payload({"AbstractText": "", "RelatedTopics": [], "Results": []}) == []
    print("✅ empty payload -> []")


if __name__ == "__main__":
    test_parse_abstract()
    test_parse_answer()
    test_parse_related_topics_flat_and_nested()
    test_parse_results_field()
    test_parse_empty_returns_empty_list()
    print("\nAll web_search parser tests passed.")
