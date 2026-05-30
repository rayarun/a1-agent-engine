#!/usr/bin/env python3
"""Direct-mode bash must run in the hardened sandbox-manager, not as a local
subprocess on the agent-worker. Direct mode bypasses Temporal for durability/
governance only — tool execution stays sandboxed.

Run: .venv/bin/python test_direct_bash_sandbox.py
"""
import asyncio
import json
import sys
from unittest import mock

sys.path.insert(0, ".")

from direct_tools_executor import DirectToolsExecutor, build_sandbox_payload


def test_build_sandbox_payload():
    assert build_sandbox_payload("echo hi") == {"code": "echo hi", "language": "bash"}
    assert build_sandbox_payload("print(1)", "python") == {"code": "print(1)", "language": "python"}
    print("✅ build_sandbox_payload shape")


class _FakeResp:
    status = 200

    async def text(self):
        return json.dumps({"result": "hi\n"})

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _FakeSession:
    posts = []

    def post(self, url, **kw):
        _FakeSession.posts.append((url, kw))
        return _FakeResp()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def test_bash_posts_to_sandbox_not_subprocess():
    _FakeSession.posts = []
    ex = DirectToolsExecutor()
    with mock.patch("aiohttp.ClientSession", lambda *a, **k: _FakeSession()):
        # If _bash tried to spawn a subprocess instead of HTTP, no post would be recorded.
        out = asyncio.run(ex._bash("grep -i error /tmp/app.log"))

    assert _FakeSession.posts, "_bash must call sandbox-manager over HTTP"
    url, kw = _FakeSession.posts[0]
    assert url.endswith("/api/v1/execute"), url
    assert kw["json"] == {"code": "grep -i error /tmp/app.log", "language": "bash"}, kw["json"]
    assert json.loads(out)["output"] == "hi\n", out
    print("✅ _bash routes to sandbox-manager with bash payload and returns output")


def test_bash_rejects_empty():
    ex = DirectToolsExecutor()
    out = asyncio.run(ex._bash("   "))
    assert "error" in json.loads(out)
    print("✅ empty command rejected")


if __name__ == "__main__":
    test_build_sandbox_payload()
    test_bash_posts_to_sandbox_not_subprocess()
    test_bash_rejects_empty()
    print("\nDirect-mode bash sandbox tests passed.")
