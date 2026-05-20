-- Migration 025: Add agent_id to skills table for sub-agent based skills
-- Allows skills to delegate to a sub-agent instead of a static tool chain

ALTER TABLE skills ADD COLUMN IF NOT EXISTS agent_id TEXT;

-- Index for efficient agent_id lookups
CREATE INDEX IF NOT EXISTS skills_agent_id_idx ON skills (agent_id) WHERE agent_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('025')
    ON CONFLICT (version) DO NOTHING;
