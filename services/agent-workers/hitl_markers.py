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

"""Shared codec for the HITL approval sentinel.

When a tool requires human approval, the platform tool bridge returns a
sentinel string instead of a tool result. Every framework's reasoning loop
must recognize this sentinel and pause for approval rather than feeding it
back to the LLM (which causes the agent to loop to max iterations).

This is the single source of truth for the marker format so the build and
parse logic can never drift between frameworks.

Format: ``__HITL_PENDING__::<approval_id>::<tool_name>::<json_args>``
"""
import json
from typing import Optional

HITL_MARKER_PREFIX = "__HITL_PENDING__::"


def build_hitl_marker(approval_id: str, tool_name: str, args: dict) -> str:
    """Build the HITL sentinel returned by the tool bridge."""
    return f"{HITL_MARKER_PREFIX}{approval_id}::{tool_name}::{json.dumps(args or {})}"


def parse_hitl_marker(text) -> Optional[dict]:
    """Parse a HITL sentinel, or return None if ``text`` isn't one.

    Returns ``{"approval_id", "tool_name", "tool_args"}``. Malformed json args
    degrade to an empty dict rather than raising — a pending approval must
    never crash the reasoning loop.
    """
    if not isinstance(text, str) or not text.startswith(HITL_MARKER_PREFIX):
        return None
    segments = text.split("::", 3)
    if len(segments) < 4:
        return None
    try:
        args = json.loads(segments[3]) if segments[3] else {}
    except (json.JSONDecodeError, ValueError):
        args = {}
    return {"approval_id": segments[1], "tool_name": segments[2], "tool_args": args}
