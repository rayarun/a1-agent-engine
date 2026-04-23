-- Migration 010: Agents table (Tier-4 agent-registry service)
-- Uses TEXT id to allow non-UUID identifiers from the Go service.

CREATE TABLE IF NOT EXISTS agents (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT NOT NULL,
    name             TEXT NOT NULL,
    version          TEXT NOT NULL,
    system_prompt    TEXT,
    skills           JSONB NOT NULL DEFAULT '[]',
    model            TEXT NOT NULL DEFAULT '',
    max_iterations   INT  NOT NULL DEFAULT 20,
    memory_budget_mb INT  NOT NULL DEFAULT 256,
    status           TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','staged','active','paused','archived')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name, version)
);

CREATE INDEX IF NOT EXISTS agents_tenant_status_idx ON agents (tenant_id, status);

INSERT INTO schema_migrations (version) VALUES ('010')
    ON CONFLICT (version) DO NOTHING;
