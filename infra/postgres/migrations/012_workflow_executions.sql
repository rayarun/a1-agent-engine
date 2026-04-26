-- Phase 5: Execution tracking table for admin observability
CREATE TABLE IF NOT EXISTS workflow_executions (
    workflow_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    agent_id TEXT,
    status TEXT NOT NULL DEFAULT 'RUNNING', -- RUNNING | COMPLETED | FAILED | CANCELLED
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for queries by tenant and time
CREATE INDEX IF NOT EXISTS idx_workflow_executions_tenant_time
ON workflow_executions(tenant_id, start_time DESC);

-- Index for queries by status
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
ON workflow_executions(status, start_time DESC);

-- Index for agent execution tracking
CREATE INDEX IF NOT EXISTS idx_workflow_executions_agent
ON workflow_executions(agent_id, start_time DESC);
