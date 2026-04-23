-- Migration 003: Immutable lifecycle audit log (all four tiers)
-- Append-only: no UPDATE or DELETE should ever be issued on this table.

CREATE TABLE IF NOT EXISTS lifecycle_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_type   TEXT NOT NULL
                        CHECK (resource_type IN ('tool','skill','sub_agent','agent','team')),
    resource_id     UUID NOT NULL,
    tenant_id       UUID NOT NULL,
    from_state      TEXT,                 -- NULL on initial creation
    to_state        TEXT NOT NULL,
    actor           TEXT NOT NULL,        -- user ID or service account
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lifecycle_events_resource_idx
    ON lifecycle_events (resource_type, resource_id);

CREATE INDEX IF NOT EXISTS lifecycle_events_tenant_idx
    ON lifecycle_events (tenant_id, created_at DESC);

INSERT INTO schema_migrations (version) VALUES ('003')
    ON CONFLICT (version) DO NOTHING;
