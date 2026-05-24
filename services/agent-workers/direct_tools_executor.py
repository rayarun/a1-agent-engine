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

import aiohttp

logger = logging.getLogger(__name__)


class DirectToolsExecutor:
    """Execute tools directly without routing through Skill Dispatcher."""

    def __init__(self):
        self.kg_service_url = "http://localhost:8084"  # Knowledge graph service
        self.web_search_engine = "duckduckgo"  # Web search backend

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
        """Execute bash command directly (no approval checks)."""
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=30)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
                return json.dumps({"error": "Command timed out after 30 seconds"})
            output = stdout.decode() or stderr.decode()
            return json.dumps({"output": output, "return_code": process.returncode})
        except Exception as e:
            return json.dumps({"error": str(e)})

    async def _web_search(self, query: str) -> str:
        """Execute web search directly (no Skill Dispatcher)."""
        try:
            async with aiohttp.ClientSession() as session:
                # Use DuckDuckGo JSON endpoint (no API key required)
                url = "https://duckduckgo.com/"
                params = {"q": query, "format": "json"}
                async with session.get(
                    url, params=params, timeout=aiohttp.ClientTimeout(total=10)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        # Extract results from DuckDuckGo response
                        results = []
                        for item in data.get("Results", [])[:5]:
                            results.append(
                                {
                                    "title": item.get("Title", ""),
                                    "url": item.get("FirstURL", ""),
                                    "snippet": item.get("Text", ""),
                                }
                            )
                        return json.dumps({"results": results, "query": query})
                    else:
                        return json.dumps({"error": f"HTTP {resp.status}"})
        except asyncio.TimeoutError:
            return json.dumps({"error": "Search timed out"})
        except Exception as e:
            logger.error(f"Web search failed: {e}")
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
