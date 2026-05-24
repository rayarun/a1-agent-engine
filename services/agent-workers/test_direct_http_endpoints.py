#!/usr/bin/env python3
"""
HTTP endpoint tests for direct agent execution.
Tests Flask API endpoints: execute-direct, session retrieval, event polling.
"""

import json
import sys
import time

sys.path.insert(0, ".")

from direct_http_handler import app


def test_http_endpoints():
    """Test HTTP API endpoints."""
    print("\n" + "=" * 60)
    print("  Direct Agent HTTP Endpoint Tests")
    print("=" * 60)

    # Create test client
    client = app.test_client()

    # Test 1: Health check
    print("\n=== Test 1: Health Check ===")
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["status"] == "ok"
    assert "active_sessions" in data
    print("✅ Health check passed")

    # Test 2: Missing X-Tenant-ID header
    print("\n=== Test 2: Missing X-Tenant-ID Header ===")
    response = client.post(
        "/api/v1/agents/execute-direct",
        json={
            "agent_id": "test-agent",
            "message": "Hello",
            "manifest": {},
        },
    )
    assert response.status_code == 400
    data = json.loads(response.data)
    assert "X-Tenant-ID" in data["error"]
    print("✅ Tenant header validation passed")

    # Test 3: Missing message in request
    print("\n=== Test 3: Missing Message Parameter ===")
    response = client.post(
        "/api/v1/agents/execute-direct",
        json={"agent_id": "test-agent", "manifest": {}},
        headers={"X-Tenant-ID": "tenant-1"},
    )
    assert response.status_code == 400
    data = json.loads(response.data)
    assert "error" in data
    print("✅ Request validation passed")

    # Test 4: Execute agent (will fail without Anthropic API key, but endpoint structure valid)
    print("\n=== Test 4: Execute Direct Agent ===")
    response = client.post(
        "/api/v1/agents/execute-direct",
        json={
            "agent_id": "test-agent",
            "message": "What is 2+2?",
            "manifest": {
                "model": "claude-opus-4-7",
                "system_prompt": "You are a helpful assistant",
                "max_iterations": 1,
                "tools": [],
            },
        },
        headers={"X-Tenant-ID": "tenant-1"},
    )
    # Expected: 200 or 500 (depending on API key), but NOT 400
    assert response.status_code in [200, 500], f"Unexpected status: {response.status_code}"
    data = json.loads(response.data)
    if response.status_code == 200:
        assert "session_id" in data
        session_id = data["session_id"]
        print(f"✅ Agent execution initiated, session: {session_id}")
    else:
        assert "error" in data
        print(f"✅ Agent execution returned error (expected without API key): {data['error'][:50]}")
        # Create session manually for next tests
        from direct_agent_executor import DirectAgentExecutor

        executor = DirectAgentExecutor()
        session = executor.get_or_create_session("test-agent", "tenant-1")
        session_id = session.id

    # Test 5: Get session metadata
    print("\n=== Test 5: Get Session Metadata ===")
    response = client.get(
        f"/api/v1/agents/sessions/{session_id}",
        headers={"X-Tenant-ID": "tenant-1"},
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["session_id"] == session_id
    assert data["agent_id"] == "test-agent"
    assert data["tenant_id"] == "tenant-1"
    print("✅ Session retrieval passed")

    # Test 6: Get session events (polling)
    print("\n=== Test 6: Poll Session Events ===")
    response = client.get(
        f"/api/v1/agents/sessions/{session_id}/events",
        headers={"X-Tenant-ID": "tenant-1"},
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "events" in data
    print(f"✅ Event polling passed ({len(data['events'])} events)")

    # Test 7: Tenant isolation - cross-tenant access denied
    print("\n=== Test 7: Tenant Isolation ===")
    response = client.get(
        f"/api/v1/agents/sessions/{session_id}",
        headers={"X-Tenant-ID": "tenant-2"},  # Different tenant
    )
    assert response.status_code == 404
    data = json.loads(response.data)
    assert "error" in data
    print("✅ Tenant isolation enforced")

    # Test 8: Non-existent session
    print("\n=== Test 8: Non-existent Session ===")
    response = client.get(
        "/api/v1/agents/sessions/nonexistent-session-id",
        headers={"X-Tenant-ID": "tenant-1"},
    )
    assert response.status_code == 404
    print("✅ Non-existent session returns 404")

    # Test 9: 404 for unknown endpoint
    print("\n=== Test 9: Unknown Endpoint ===")
    response = client.get("/api/v1/unknown-endpoint", headers={"X-Tenant-ID": "tenant-1"})
    assert response.status_code == 404
    print("✅ Unknown endpoint returns 404")

    # Test 10: Invalid JSON body
    print("\n=== Test 10: Invalid JSON Body ===")
    response = client.post(
        "/api/v1/agents/execute-direct",
        data="not valid json",
        content_type="application/json",
        headers={"X-Tenant-ID": "tenant-1"},
    )
    assert response.status_code == 400
    print("✅ Invalid JSON handling passed")

    print("\n" + "=" * 60)
    print("Results: 10/10 passed")
    print("=" * 60)
    print("\n✅ ALL HTTP ENDPOINT TESTS PASSED\n")
    return True


if __name__ == "__main__":
    try:
        success = test_http_endpoints()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed with exception: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
