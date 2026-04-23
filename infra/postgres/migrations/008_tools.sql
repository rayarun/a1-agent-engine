-- Migration 008: Tools table (Tier-1 tool-registry service)
-- Uses TEXT id to allow non-UUID identifiers from the Go service.

CREATE TABLE IF NOT EXISTS tools (
    id               TEXT PRIMARY KEY,
    tenant_id        TEXT NOT NULL,
    name             TEXT NOT NULL,
    version          TEXT NOT NULL,
    description      TEXT,
    auth_level       TEXT NOT NULL DEFAULT 'read'
                         CHECK (auth_level IN ('read','mutating')),
    sandbox_required BOOLEAN NOT NULL DEFAULT false,
    input_schema     JSONB,
    output_schema    JSONB,
    status           TEXT NOT NULL DEFAULT 'pending_review'
                         CHECK (status IN ('pending_review','approved','deprecated')),
    registered_by    TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name, version)
);

CREATE INDEX IF NOT EXISTS tools_tenant_status_idx ON tools (tenant_id, status);

INSERT INTO schema_migrations (version) VALUES ('008')
    ON CONFLICT (version) DO NOTHING;
