-- Copyright 2026 Arun Ray
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.

-- Hybrid Workflow Platform: Registry and Run Tracking

CREATE TABLE IF NOT EXISTS workflow_registrations (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    name TEXT,
    description TEXT,
    workflow_type TEXT NOT NULL DEFAULT 'yaml',  -- 'yaml' | 'code'
    workflow_class TEXT,                          -- for type='code': class name in developer worker
    task_queue TEXT NOT NULL,                     -- which Temporal queue to dispatch to
    definition JSONB,                             -- for type='yaml': parsed WorkflowDefinition
    input_schema JSONB,                           -- JSON Schema for workflow inputs
    trigger_config JSONB,                         -- { type: cron|webhook|manual, cron?, webhook_secret? }
    status TEXT NOT NULL DEFAULT 'active',        -- active | paused | archived
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id),
    CONSTRAINT valid_workflow_type CHECK (workflow_type IN ('yaml', 'code')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_registrations_tenant_status ON workflow_registrations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_registrations_task_queue ON workflow_registrations(task_queue);

-- RLS policy for workflow_registrations
ALTER TABLE workflow_registrations ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflow_registrations_tenant_isolation' AND tablename = 'workflow_registrations') THEN
    CREATE POLICY workflow_registrations_tenant_isolation ON workflow_registrations USING (tenant_id = current_setting('app.tenant_id')::text);
  END IF;
END $$;


CREATE TABLE IF NOT EXISTS workflow_runs (
    run_id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',       -- pending | running | completed | failed | cancelled
    current_step_id TEXT,
    step_results JSONB DEFAULT '{}',              -- { step_id -> { status, output, error, duration_ms } }
    inputs JSONB,
    output JSONB,
    error TEXT,
    temporal_workflow_id TEXT,
    temporal_run_id TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant_workflow ON workflow_runs(tenant_id, workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant_status ON workflow_runs(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at ON workflow_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_temporal_id ON workflow_runs(temporal_workflow_id);

-- RLS policy for workflow_runs
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'workflow_runs_tenant_isolation' AND tablename = 'workflow_runs') THEN
    CREATE POLICY workflow_runs_tenant_isolation ON workflow_runs USING (tenant_id = current_setting('app.tenant_id')::text);
  END IF;
END $$;


-- HITL Approval tracking (durability fix)
CREATE TABLE IF NOT EXISTS hitl_approvals (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    agent_id TEXT,
    tool_name TEXT NOT NULL,
    tool_args JSONB,
    reason TEXT,
    status TEXT DEFAULT 'pending',                -- pending | approved | denied | expired
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    denial_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'denied', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_hitl_approvals_tenant_status ON hitl_approvals(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_hitl_approvals_workflow_id ON hitl_approvals(workflow_id);
CREATE INDEX IF NOT EXISTS idx_hitl_approvals_expires_at ON hitl_approvals(expires_at);

-- RLS policy for hitl_approvals
ALTER TABLE hitl_approvals ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'hitl_approvals_tenant_isolation' AND tablename = 'hitl_approvals') THEN
    CREATE POLICY hitl_approvals_tenant_isolation ON hitl_approvals USING (tenant_id = current_setting('app.tenant_id')::text);
  END IF;
END $$;
