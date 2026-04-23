-- Migration 001: Agent memories table (extracted from init.sql)
-- Idempotent: all statements use IF NOT EXISTS

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version     TEXT PRIMARY KEY,
    applied_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_memories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    agent_id    TEXT NOT NULL,
    session_id  TEXT,
    content     TEXT NOT NULL,
    embedding   VECTOR(1536),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_memories_tenant_agent_idx
    ON agent_memories (tenant_id, agent_id);

CREATE INDEX IF NOT EXISTS agent_memories_embedding_idx
    ON agent_memories USING hnsw (embedding vector_cosine_ops);

INSERT INTO schema_migrations (version) VALUES ('001')
    ON CONFLICT (version) DO NOTHING;
