-- Migration 009: Skills table (Tier-2 skill-catalog service)
-- Uses TEXT id to allow non-UUID identifiers from the Go service.

CREATE TABLE IF NOT EXISTS skills (
    id                TEXT PRIMARY KEY,
    tenant_id         TEXT NOT NULL,
    name              TEXT NOT NULL,
    version           TEXT NOT NULL,
    description       TEXT,
    tools             JSONB NOT NULL DEFAULT '[]',
    sop               TEXT,
    mutating          BOOLEAN NOT NULL DEFAULT false,
    approval_required BOOLEAN NOT NULL DEFAULT false,
    hooks             JSONB NOT NULL DEFAULT '[]',
    status            TEXT NOT NULL DEFAULT 'draft'
                          CHECK (status IN ('draft','staged','active','paused','archived')),
    published_by      TEXT NOT NULL DEFAULT '',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name, version)
);

CREATE INDEX IF NOT EXISTS skills_tenant_status_idx ON skills (tenant_id, status);
CREATE INDEX IF NOT EXISTS skills_tenant_name_idx   ON skills (tenant_id, name, version);

INSERT INTO schema_migrations (version) VALUES ('009')
    ON CONFLICT (version) DO NOTHING;
