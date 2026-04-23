-- Migration 002: Sub-agent contracts (Tier-3 registry storage)

CREATE TABLE IF NOT EXISTS sub_agent_contracts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    name            TEXT NOT NULL,
    version         TEXT NOT NULL,                       -- semver string e.g. "1.0.0"
    persona         TEXT,
    allowed_skills  JSONB NOT NULL DEFAULT '[]',         -- [{name, version}]
    model           TEXT NOT NULL,
    max_iterations  INT NOT NULL DEFAULT 10,
    input_schema    JSONB,
    output_schema   JSONB,
    status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','staged','active','paused','archived')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name, version)
);

CREATE INDEX IF NOT EXISTS sub_agent_contracts_tenant_status_idx
    ON sub_agent_contracts (tenant_id, status);

CREATE INDEX IF NOT EXISTS sub_agent_contracts_tenant_name_idx
    ON sub_agent_contracts (tenant_id, name);

INSERT INTO schema_migrations (version) VALUES ('002')
    ON CONFLICT (version) DO NOTHING;
