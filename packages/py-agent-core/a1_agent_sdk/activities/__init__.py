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

"""Platform SDK activities for hybrid workflows."""

from .skill import invoke_skill, invoke_tool
from .mcp import invoke_mcp_tool
from .agent import run_agent
from .hitl import hitl_approval
from .kg import kg_search, kg_query
from .notification import notify


def get_platform_activities() -> list:
    """Returns all platform SDK activities for Worker registration."""
    return [
        invoke_skill,
        invoke_tool,
        invoke_mcp_tool,
        run_agent,
        hitl_approval,
        kg_search,
        kg_query,
        notify,
    ]


__all__ = [
    "invoke_skill",
    "invoke_tool",
    "invoke_mcp_tool",
    "run_agent",
    "hitl_approval",
    "kg_search",
    "kg_query",
    "notify",
    "get_platform_activities",
]
