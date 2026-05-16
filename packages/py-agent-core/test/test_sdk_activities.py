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

import pytest
import json
from unittest.mock import patch, AsyncMock, MagicMock
import httpx

from a1_agent_sdk.activities.skill import invoke_skill, invoke_tool
from a1_agent_sdk.activities.mcp import invoke_mcp_tool
from a1_agent_sdk.activities.hitl import hitl_approval
from a1_agent_sdk.activities.kg import kg_search, kg_query
from a1_agent_sdk.activities.notification import notify


class TestInvokeSkill:
    """Tests for invoke_skill activity."""

    @pytest.mark.asyncio
    async def test_invoke_skill_success(self):
        """Test successful skill invocation."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {"result": {"status": "success", "data": "test"}}

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await invoke_skill("fetch-data", {"date": "2026-05-16"}, "tenant-1")

            assert result == {"status": "success", "data": "test"}

    @pytest.mark.asyncio
    async def test_invoke_skill_failure(self):
        """Test skill invocation failure."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = False
            mock_response.status_code = 500

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                side_effect=Exception("Network error")
            )

            result = await invoke_skill("fetch-data", {"date": "2026-05-16"}, "tenant-1")

            assert "error" in result
            assert "Network error" in result["error"]

    @pytest.mark.asyncio
    async def test_invoke_skill_http_error(self):
        """Test skill invocation with HTTP error."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = False
            mock_response.status_code = 404

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )
            mock_response.raise_for_status.side_effect = Exception("404 Not Found")

            result = await invoke_skill("nonexistent", {}, "tenant-1")

            assert "error" in result


class TestInvokeTool:
    """Tests for invoke_tool activity."""

    @pytest.mark.asyncio
    async def test_invoke_tool_success(self):
        """Test successful tool invocation."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {"result": {"value": 42}}

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await invoke_tool(
                "calculate",
                "1.0.0",
                {"x": 10, "y": 32},
                "tenant-1",
                mutating=False,
            )

            assert result == {"value": 42}

    @pytest.mark.asyncio
    async def test_invoke_tool_with_mutating_flag(self):
        """Test tool invocation with mutating flag."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {"result": {"created": True}}

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await invoke_tool(
                "create-record",
                "1.0.0",
                {"name": "test"},
                "tenant-1",
                mutating=True,
            )

            assert result == {"created": True}


class TestInvokeMcpTool:
    """Tests for invoke_mcp_tool activity."""

    @pytest.mark.asyncio
    async def test_invoke_mcp_tool_success(self):
        """Test successful MCP tool invocation."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {
                "result": {"trades": [{"id": "T1", "symbol": "INFY"}]}
            }

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await invoke_mcp_tool(
                "NSE Trade Feed API",
                "get_trades",
                {"date": "2026-05-16"},
                "tenant-1",
            )

            assert "trades" in result
            assert len(result["trades"]) == 1

    @pytest.mark.asyncio
    async def test_invoke_mcp_tool_timeout(self):
        """Test MCP tool invocation timeout."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                side_effect=Exception("Connection timeout")
            )

            result = await invoke_mcp_tool(
                "NSE Trade Feed API", "get_trades", {}, "tenant-1"
            )

            assert "error" in result

    @pytest.mark.asyncio
    async def test_invoke_mcp_tool_invalid_server(self):
        """Test MCP tool invocation with invalid server."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = False
            mock_response.status_code = 404

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )
            mock_response.raise_for_status.side_effect = Exception("Server not found")

            result = await invoke_mcp_tool(
                "NonExistent Server", "some_tool", {}, "tenant-1"
            )

            assert "error" in result


class TestHitlApproval:
    """Tests for HITL approval activity."""

    @pytest.mark.asyncio
    async def test_hitl_approval_success(self):
        """Test successful HITL approval."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {
                "approved": True,
                "approved_by": "user@example.com",
                "approved_at": "2026-05-16T17:00:00Z",
                "notes": "Approved after review",
            }

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await hitl_approval(
                "Review and approve settlement?",
                {"settlement_id": "S123"},
                "tenant-1",
                timeout_minutes=60,
            )

            assert result["approved"] is True
            assert result["approved_by"] == "user@example.com"

    @pytest.mark.asyncio
    async def test_hitl_approval_denied(self):
        """Test HITL approval denial."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {
                "approved": False,
                "approved_by": "user@example.com",
                "notes": "Risk too high",
            }

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await hitl_approval(
                "Review and approve settlement?",
                {"settlement_id": "S123"},
                "tenant-1",
            )

            assert result["approved"] is False


class TestKgSearch:
    """Tests for knowledge graph search activity."""

    @pytest.mark.asyncio
    async def test_kg_search_success(self):
        """Test successful KG search."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {
                "results": [
                    {"node_id": "N1", "type": "trade", "symbol": "INFY"},
                    {"node_id": "N2", "type": "trade", "symbol": "TCS"},
                ]
            }

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await kg_search(
                "trade-graph", "Find all INFY trades", "tenant-1"
            )

            assert "results" in result
            assert len(result["results"]) == 2

    @pytest.mark.asyncio
    async def test_kg_search_no_results(self):
        """Test KG search with no results."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {"results": []}

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await kg_search(
                "trade-graph", "Find nonexistent trades", "tenant-1"
            )

            assert result["results"] == []


class TestKgQuery:
    """Tests for knowledge graph query activity."""

    @pytest.mark.asyncio
    async def test_kg_query_success(self):
        """Test successful KG query from node."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {
                "start_node": {"node_id": "N1", "type": "trade"},
                "connected_nodes": [
                    {"node_id": "N2", "type": "client"},
                    {"node_id": "N3", "type": "exchange"},
                ],
            }

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await kg_query(
                "trade-graph", "N1", "tenant-1", depth=2
            )

            assert result["start_node"]["type"] == "trade"
            assert len(result["connected_nodes"]) == 2


class TestNotify:
    """Tests for notification activity."""

    @pytest.mark.asyncio
    async def test_notify_slack_success(self):
        """Test successful Slack notification."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {"result": {"message_id": "msg-123"}}

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await notify(
                "slack:#alerts",
                "Settlement completed successfully",
                "tenant-1",
            )

            assert result["success"] is True

    @pytest.mark.asyncio
    async def test_notify_email_success(self):
        """Test successful email notification."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_response = MagicMock()
            mock_response.ok = True
            mock_response.json.return_value = {"result": {"sent": True}}

            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                return_value=mock_response
            )

            result = await notify(
                "email:ops@example.com",
                "Critical error in settlement",
                "tenant-1",
            )

            assert result["success"] is True

    @pytest.mark.asyncio
    async def test_notify_failure(self):
        """Test notification failure."""
        with patch("httpx.AsyncClient") as mock_client:
            mock_client.return_value.__aenter__.return_value.post = AsyncMock(
                side_effect=Exception("Service unavailable")
            )

            result = await notify(
                "slack:#alerts",
                "Test message",
                "tenant-1",
            )

            assert result["success"] is False
            assert "error" in result


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
