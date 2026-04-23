-- Migration 005: Tool registry (Tier-1 primitive atoms)

CREATE TABLE IF NOT EXISTS tool_specs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    name            TEXT NOT NULL,
    version         TEXT NOT NULL,
    description     TEXT,
    auth_level      TEXT NOT NULL DEFAULT 'read'
                        CHECK (auth_level IN ('read','mutating')),
    sandbox_required BOOLEAN NOT NULL DEFAULT false,
    input_schema    JSONB,
    output_schema   JSONB,
    status          TEXT NOT NULL DEFAULT 'pending_review'
                        CHECK (status IN ('pending_review','approved','deprecated')),
    registered_by   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name, version)
);

CREATE INDEX IF NOT EXISTS tool_specs_tenant_status_idx
    ON tool_specs (tenant_id, status);

INSERT INTO schema_migrations (version) VALUES ('005')
    ON CONFLICT (version) DO NOTHING;
