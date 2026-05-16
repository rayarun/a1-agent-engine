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

"""
a1-agent-sdk: Platform SDK for hybrid Temporal workflows.

Exposes platform primitives (skills, agents, HITL, KG) as Temporal activities
so developers can call them from their own @workflow.defn and @activity.defn code.
"""

from .activities import (
    invoke_skill,
    invoke_tool,
    invoke_mcp_tool,
    run_agent,
    hitl_approval,
    kg_search,
    kg_query,
    notify,
    get_platform_activities,
)

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

__version__ = "1.0.0"
