-- Migration 026: Add framework and native_tools to agents table
-- Enables multi-framework agent support (pydantic-ai, anthropic-agents, google-adk, openai-agents)

ALTER TABLE agents ADD COLUMN IF NOT EXISTS framework TEXT NOT NULL DEFAULT 'pydantic-ai';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS native_tools JSONB DEFAULT '{}';

-- Index for efficient framework lookups
CREATE INDEX IF NOT EXISTS agents_framework_idx ON agents (framework) WHERE framework != 'pydantic-ai';

INSERT INTO schema_migrations (version) VALUES ('026')
    ON CONFLICT (version) DO NOTHING;
