-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Agent Memories Table
CREATE TABLE IF NOT EXISTS agent_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    session_id TEXT,
    content TEXT NOT NULL,
    embedding VECTOR(1536), -- Dimension for OpenAI text-embedding-ada-002 / 3-small
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Index for similarity search
CREATE INDEX ON agent_memories USING hnsw (embedding vector_cosine_ops);
