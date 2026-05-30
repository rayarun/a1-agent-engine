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

"""Anthropic message-history conformance.

The Anthropic Messages API requires that every ``tool_result`` for a single
assistant turn live in ONE user message that immediately follows the
assistant's ``tool_use`` message. Both our core ReAct loop and the HITL resume
path can append one user message per tool_result; when an assistant turn has
multiple tool_use blocks (e.g. two ``bash`` calls each gated by a separate
approval), this produces consecutive tool_result user messages. The API then
rejects the second with:

    messages.N.content.0: unexpected `tool_use_id` found in `tool_result`
    blocks: <id>. Each `tool_result` block must have a corresponding
    `tool_use` block in the previous message.

Merging adjacent tool_result user messages back into one restores conformance.
"""


def _block_type(block):
    if isinstance(block, dict):
        return block.get("type")
    return getattr(block, "type", None)


def _is_tool_result_content(content) -> bool:
    """True if content is a non-empty list of only tool_result blocks."""
    if not isinstance(content, list) or not content:
        return False
    return all(_block_type(b) == "tool_result" for b in content)


def merge_consecutive_tool_results(messages: list) -> list:
    """Merge adjacent user messages that contain only tool_result blocks.

    Returns a new list; input is not mutated. Non-tool_result messages and
    assistant messages are passed through untouched and in order.
    """
    merged: list = []
    for msg in messages:
        is_result_msg = (
            isinstance(msg, dict)
            and msg.get("role") == "user"
            and _is_tool_result_content(msg.get("content"))
        )
        prev = merged[-1] if merged else None
        prev_is_result_msg = (
            isinstance(prev, dict)
            and prev.get("role") == "user"
            and _is_tool_result_content(prev.get("content"))
        )

        if is_result_msg and prev_is_result_msg:
            merged[-1] = {
                "role": "user",
                "content": list(prev["content"]) + list(msg["content"]),
            }
        else:
            merged.append(msg)
    return merged
