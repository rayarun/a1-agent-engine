-- Migration: Add execution_mode column to agents table
-- Purpose: Support both Temporal and direct (non-Temporal) agent execution modes
-- Date: 2026-05-24

ALTER TABLE agents ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'temporal';

-- Add index for execution_mode queries
CREATE INDEX IF NOT EXISTS idx_agents_execution_mode ON agents(execution_mode);

-- Add check constraint to ensure valid values
ALTER TABLE agents ADD CONSTRAINT agents_execution_mode_check
    CHECK (execution_mode IN ('temporal', 'direct'));
