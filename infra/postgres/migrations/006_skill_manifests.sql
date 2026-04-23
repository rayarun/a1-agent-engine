-- Migration 006: Skill catalog (Tier-2 governed compositions)

CREATE TABLE IF NOT EXISTS skill_manifests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    name                TEXT NOT NULL,
    version             TEXT NOT NULL,
    description         TEXT,
    tools               JSONB NOT NULL DEFAULT '[]',  -- [{name, version}]
    sop                 TEXT,                          -- system operating procedure
    mutating            BOOLEAN NOT NULL DEFAULT false,
    approval_required   BOOLEAN NOT NULL DEFAULT false,
    hooks               JSONB NOT NULL DEFAULT '[]',  -- [{phase, type, config}]
    status              TEXT NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','staged','active','paused','archived')),
    published_by        TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, name, version)
);

CREATE INDEX IF NOT EXISTS skill_manifests_tenant_status_idx
    ON skill_manifests (tenant_id, status);

INSERT INTO schema_migrations (version) VALUES ('006')
    ON CONFLICT (version) DO NOTHING;
