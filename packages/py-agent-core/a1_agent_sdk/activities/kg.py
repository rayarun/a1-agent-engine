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

"""Knowledge Graph query activities."""

import logging
import os
from temporalio import activity
import httpx


@activity.defn
async def kg_search(graph_id: str, query: str, tenant_id: str) -> dict:
    """
    Searches a Knowledge Graph for matching nodes.

    Args:
        graph_id: ID of the knowledge graph to search
        query: Natural language or structured query string
        tenant_id: Tenant ID for multi-tenancy

    Returns:
        List of matching nodes with metadata
    """
    kg_service_url = os.getenv("KG_SERVICE_URL", "http://localhost:8093")
    logging.info(f"Searching KG '{graph_id}' with query: {query[:100]}...")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{kg_service_url}/api/v1/graphs/{graph_id}/search",
                json={"query": query},
                headers={"X-Tenant-ID": tenant_id},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("results", data)
    except Exception as e:
        logging.error(f"KG search failed: {e}")
        return {"error": f"Error searching KG '{graph_id}': {str(e)}", "results": []}


@activity.defn
async def kg_query(
    graph_id: str,
    start_node_id: str,
    tenant_id: str,
    depth: int = 2,
) -> dict:
    """
    Queries a Knowledge Graph starting from a specific node.

    Performs a graph traversal to find related entities and relationships.

    Args:
        graph_id: ID of the knowledge graph
        start_node_id: Starting node ID for traversal
        tenant_id: Tenant ID for multi-tenancy
        depth: Maximum traversal depth (default 2)

    Returns:
        Subgraph containing the starting node and related entities
    """
    kg_service_url = os.getenv("KG_SERVICE_URL", "http://localhost:8093")
    logging.info(f"Querying KG '{graph_id}' from node '{start_node_id}'")

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{kg_service_url}/api/v1/graphs/{graph_id}/query",
                json={
                    "start_node_id": start_node_id,
                    "depth": depth,
                },
                headers={"X-Tenant-ID": tenant_id},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data
    except Exception as e:
        logging.error(f"KG query failed: {e}")
        return {"error": f"Error querying KG '{graph_id}': {str(e)}"}
