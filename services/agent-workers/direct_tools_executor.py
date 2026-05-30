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
Direct tool executor for non-Temporal agent execution.
Bypasses Skill Dispatcher for speed; tool invocation is direct and local.
"""

import asyncio
import json
import logging
import os

import aiohttp

logger = logging.getLogger(__name__)


def build_sandbox_payload(code: str, language: str = "bash") -> dict:
    """Request body for sandbox-manager's /api/v1/execute."""
    return {"code": code, "language": language}


def parse_ddg_payload(data: dict) -> list:
    """Extract usable results from a DuckDuckGo Instant Answer payload.

    DDG's IA API is not a general web search: for most queries the `Results`
    array is empty and the useful content lives in Abstract/Answer/Definition/
    RelatedTopics instead. Pull from all of them. Returns a list of
    {title, url, snippet} dicts (possibly empty).
    """
    results = []

    abstract = (data.get("AbstractText") or "").strip()
    if abstract:
        results.append({
            "title": data.get("Heading", ""),
            "url": data.get("AbstractURL", ""),
            "snippet": abstract,
        })

    answer = (data.get("Answer") or "").strip()
    if answer:
        results.append({"title": data.get("AnswerType", "Answer"), "url": "", "snippet": answer})

    definition = (data.get("Definition") or "").strip()
    if definition:
        results.append({
            "title": "Definition",
            "url": data.get("DefinitionURL", ""),
            "snippet": definition,
        })

    def _add_topic(topic):
        text = (topic.get("Text") or "").strip()
        if text:
            results.append({"title": "", "url": topic.get("FirstURL", ""), "snippet": text})

    for item in data.get("RelatedTopics", []):
        if isinstance(item, dict) and item.get("Topics"):  # nested group
            for sub in item["Topics"]:
                _add_topic(sub)
        elif isinstance(item, dict):
            _add_topic(item)

    for item in data.get("Results", []):
        text = (item.get("Text") or "").strip()
        if text or item.get("Title"):
            results.append({
                "title": item.get("Title", ""),
                "url": item.get("FirstURL", ""),
                "snippet": text,
            })

    return results


class DirectToolsExecutor:
    """Execute tools directly without routing through Skill Dispatcher."""

    def __init__(self):
        self.kg_service_url = "http://localhost:8084"  # Knowledge graph service
        self.web_search_engine = "duckduckgo"  # Web search backend
        # Bash runs in the hardened sandbox-manager, never as a local subprocess.
        # By convention this env var is the FULL execute endpoint URL.
        self.sandbox_manager_url = os.getenv(
            "SANDBOX_MANAGER_URL", "http://localhost:8082/api/v1/execute"
        )

    async def invoke(self, tool_name: str, args: dict) -> str:
        """
        Invoke tool directly.

        Args:
            tool_name: Tool name (bash, web_search, kg_search, etc.)
            args: Tool arguments

        Returns:
            Tool result as JSON string
        """
        logger.info(f"[DIRECT_TOOLS] invoke called: tool_name={tool_name}, args_keys={list(args.keys())}")
        try:
            if tool_name == "bash":
                logger.info(f"[DIRECT_TOOLS] Executing bash: {args.get('command', '')[:100]}")
                result = await self._bash(args.get("command", ""))
                logger.info(f"[DIRECT_TOOLS] Bash result: {result[:200]}")
                return result
            elif tool_name == "web_search":
                return await self._web_search(args.get("query", ""))
            elif tool_name == "kg_search":
                return await self._kg_search(args.get("query", ""))
            else:
                return json.dumps({"error": f"Unknown tool: {tool_name}"})
        except Exception as e:
            logger.error(f"Tool execution failed: {tool_name}: {e}")
            return json.dumps({"error": str(e)})

    async def _bash(self, command: str) -> str:
        """Execute bash in the hardened sandbox-manager (not on the worker).

        Direct mode bypasses Temporal for durability/governance only; the bash
        script still runs in the isolated, non-root, network-isolated sandbox
        container — never as a local subprocess on the agent-worker.
        """
        if not command or not command.strip():
            return json.dumps({"error": "Command cannot be empty"})
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.sandbox_manager_url,
                    json=build_sandbox_payload(command, "bash"),
                    timeout=aiohttp.ClientTimeout(total=60),
                ) as resp:
                    text = await resp.text()
                    if resp.status != 200:
                        return json.dumps({"error": f"sandbox returned HTTP {resp.status}", "detail": text[:500]})
                    try:
                        data = json.loads(text)
                    except (json.JSONDecodeError, ValueError):
                        return json.dumps({"error": "invalid sandbox response"})
                    return json.dumps({"output": data.get("result", "")})
        except asyncio.TimeoutError:
            return json.dumps({"error": "Command timed out"})
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def _web_search(self, query: str) -> str:
        """Execute web search directly (no Skill Dispatcher)."""
        logger.info(f"[WEB_SEARCH] Starting search for query: '{query}'")
        if not query or not query.strip():
            logger.warning("[WEB_SEARCH] Empty query provided")
            return json.dumps({"error": "Search query cannot be empty"})

        try:
            async with aiohttp.ClientSession() as session:
                # DuckDuckGo Instant Answer API (no API key required). It always
                # responds with content-type application/x-javascript, so we read
                # the body as text and json.loads it rather than relying on
                # resp.json() (which would raise on the non-JSON content-type).
                url = "https://api.duckduckgo.com/"
                params = {"q": query, "format": "json", "no_html": "1", "no_redirect": "1"}
                headers = {"User-Agent": "Mozilla/5.0 (compatible; a1-agent/1.0)"}

                logger.info(f"[WEB_SEARCH] Calling DuckDuckGo: {url}?q={query}")
                async with session.get(
                    url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    logger.info(f"[WEB_SEARCH] Got response: status={resp.status}, content-type={resp.content_type}")
                    text = await resp.text()

                # 202 = DDG rate-limiting/soft response; not a hard failure. Only a
                # 4xx/5xx with no parseable body is a genuine error.
                try:
                    data = json.loads(text)
                except (json.JSONDecodeError, ValueError):
                    if resp.status >= 400:
                        logger.error(f"[WEB_SEARCH] HTTP error: {resp.status}")
                        return json.dumps({"error": f"HTTP {resp.status}"})
                    logger.warning("[WEB_SEARCH] Unparseable response body")
                    return json.dumps({
                        "results": [],
                        "query": query,
                        "message": "No web results found for this query. Answer from your own knowledge instead.",
                    })

                results = parse_ddg_payload(data)[:5]
                logger.info(f"[WEB_SEARCH] query='{query}', found {len(results)} results")
                if not results:
                    # Terminal, non-error signal so the agent concludes instead of
                    # retrying the search until it exhausts its iteration budget.
                    return json.dumps({
                        "results": [],
                        "query": query,
                        "message": "No web results found for this query. Answer from your own knowledge instead.",
                    })
                return json.dumps({"results": results, "query": query})
        except asyncio.TimeoutError:
            logger.error("[WEB_SEARCH] Search timed out")
            return json.dumps({"error": "Search timed out"})
        except Exception as e:
            logger.error(f"[WEB_SEARCH] Exception: {e}", exc_info=True)
            return json.dumps({"error": str(e)})

    async def _kg_search(self, query: str) -> str:
        """Execute knowledge graph search directly."""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.kg_service_url}/api/v1/search",
                    json={"query": query},
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return json.dumps(data)
                    else:
                        return json.dumps({"error": f"HTTP {resp.status}"})
        except asyncio.TimeoutError:
            return json.dumps({"error": "KG search timed out"})
        except Exception as e:
            logger.error(f"KG search failed: {e}")
            return json.dumps({"error": str(e)})
