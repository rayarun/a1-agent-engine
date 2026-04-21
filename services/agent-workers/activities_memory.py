import os
import json
import logging
import psycopg2
from pgvector.psycopg2 import register_vector
from temporalio import activity
from openai import AsyncOpenAI

# DB Configuration
DB_URL = os.getenv("POSTGRES_URL", "postgresql://postgres:postgres@localhost:5432/agentplatform")

def get_db_connection():
    conn = psycopg2.connect(DB_URL)
    register_vector(conn)
    return conn

@activity.defn
async def recall_memories(query: str, agent_id: str, limit: int = 3) -> list[str]:
    """Retrieves semantically relevant memories from the vector store."""
    logging.info(f"Recalling memories for agent {agent_id}: {query}")
    
    # 1. Get Embedding for query via LLM Gateway
    gateway_url = os.getenv("LLM_GATEWAY_URL", "http://localhost:8083/v1")
    client = AsyncOpenAI(base_url=gateway_url, api_key="sk-mock")
    
    try:
        resp = await client.embeddings.create(
            input=[query],
            model="text-embedding-3-small"
        )
        query_embedding = resp.data[0].embedding
        
        # 2. Search Postgres using pgvector
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT content FROM agent_memories 
                    WHERE agent_id = %s 
                    ORDER BY embedding <=> %s 
                    LIMIT %s
                    """,
                    (agent_id, query_embedding, limit)
                )
                results = cur.fetchall()
                return [row[0] for row in results]
    except Exception as e:
        logging.error(f"Failed to recall memories: {e}")
        return []

@activity.defn
async def store_memory(content: str, agent_id: str, metadata: dict = None) -> bool:
    """Stores a new fact or observation as a vector memory."""
    logging.info(f"Storing memory for agent {agent_id}: {content[:50]}...")
    
    gateway_url = os.getenv("LLM_GATEWAY_URL", "http://localhost:8083/v1")
    client = AsyncOpenAI(base_url=gateway_url, api_key="sk-mock")
    
    try:
        resp = await client.embeddings.create(
            input=[content],
            model="text-embedding-3-small"
        )
        embedding = resp.data[0].embedding
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO agent_memories (agent_id, content, embedding, metadata)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (agent_id, content, embedding, json.dumps(metadata or {}))
                )
            conn.commit()
        return True
    except Exception as e:
        logging.error(f"Failed to store memory: {e}")
        return False
