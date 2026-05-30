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

"""Shared AgentDecision post-processor.

Every framework reasoning loop (Anthropic, PydanticAI, Google ADK, OpenAI
Agents) produces a raw decision dict that the durable workflow loop consumes.
Cross-cutting normalization — required keys, type coercion, token accounting,
and the HITL pause invariant — used to be hand-rolled per framework and drift
(the Anthropic path once let a pending approval keep looping). Running every
framework's decision through finalize_decision() guarantees the contract in
ONE place.

Frameworks call this at their return boundary; see anthropic_agents_run and
pydantic_ai_reasoning_step in activities_agent.py.
"""

# Keys the workflow loop relies on; every finalized decision has them.
REQUIRED_KEYS = (
    "final_answer",
    "tool_calls",
    "messages_delta",
    "continue_loop",
    "hitl_pending",
    "tokens_in",
    "tokens_out",
)


def _as_int(value) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def finalize_decision(decision: dict) -> dict:
    """Normalize a framework decision into the governed AgentDecision contract.

    - Guarantees every REQUIRED_KEYS entry exists with a sane default.
    - Coerces types (lists, bools, ints) so downstream code can trust them.
    - Enforces the HITL invariant: a pending approval pauses the loop — it
      must never also continue the loop or carry a final answer. This is the
      structural guard against the "approved tool loops to max iterations"
      class of bug.

    Unknown keys (e.g. hitl_approval_id, error, reasoning) are preserved.
    """
    d = dict(decision or {})

    d["final_answer"] = d.get("final_answer")
    d["tool_calls"] = d.get("tool_calls") or []
    d["messages_delta"] = d.get("messages_delta") or []
    d["continue_loop"] = bool(d.get("continue_loop", False))
    d["hitl_pending"] = bool(d.get("hitl_pending", False))
    d["tokens_in"] = _as_int(d.get("tokens_in"))
    d["tokens_out"] = _as_int(d.get("tokens_out"))

    if d["hitl_pending"]:
        d["continue_loop"] = False
        d["final_answer"] = None

    return d
