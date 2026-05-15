-- Migration 020: Standardize all tenant_id columns to TEXT type
-- Previously, some tables had UUID tenant_id while others had TEXT.
-- This migration converts all remaining UUID columns to TEXT to match tenant_settings format.

-- agent_memories: Drop constraints, alter, recreate constraints
ALTER TABLE agent_memories DROP CONSTRAINT IF EXISTS agent_memories_pkey;
ALTER TABLE agent_memories ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;
ALTER TABLE agent_memories ADD PRIMARY KEY (id);

-- cost_events: Detach partition, alter both, reattach
ALTER TABLE cost_events DETACH PARTITION cost_events_default;
ALTER TABLE cost_events ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;
ALTER TABLE cost_events_default ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;
ALTER TABLE cost_events ATTACH PARTITION cost_events_default DEFAULT;

-- idempotency_keys
ALTER TABLE idempotency_keys ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;

-- lifecycle_events
ALTER TABLE lifecycle_events ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;

-- skill_manifests
ALTER TABLE skill_manifests ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;

-- sub_agent_contracts
ALTER TABLE sub_agent_contracts ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;

-- tool_specs
ALTER TABLE tool_specs ALTER COLUMN tenant_id TYPE TEXT USING tenant_id::TEXT;
