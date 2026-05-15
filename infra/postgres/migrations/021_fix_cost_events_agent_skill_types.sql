-- Migration 021: Fix cost_events agent_id and skill_id column types
-- Both columns should be TEXT to match how agents and skills are identified in the system
-- agent_id comes from request.agent_id which is a string like "SRE-DevOps"
-- skill_id is also identified by string ID in the system

-- For partitioned tables, alter only the parent; children inherit the change
ALTER TABLE cost_events ALTER COLUMN agent_id TYPE TEXT USING agent_id::TEXT;
ALTER TABLE cost_events ALTER COLUMN skill_id TYPE TEXT USING skill_id::TEXT;
