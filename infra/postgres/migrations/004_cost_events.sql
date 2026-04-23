-- Migration 004: Cost attribution events
-- Uses PostgreSQL native range partitioning by month (no TimescaleDB dependency).
-- Parent table is unpartitioned for schema clarity; partitions are created monthly by the
-- cost-attribution service or a scheduled job.

CREATE TABLE IF NOT EXISTS cost_events (
    time            TIMESTAMPTZ NOT NULL,
    tenant_id       UUID NOT NULL,
    agent_id        UUID,
    skill_id        UUID,
    tokens_in       INT NOT NULL DEFAULT 0,
    tokens_out      INT NOT NULL DEFAULT 0,
    sandbox_ms      INT NOT NULL DEFAULT 0,
    vector_ops      INT NOT NULL DEFAULT 0
) PARTITION BY RANGE (time);

-- Default partition catches rows that don't match a specific month partition.
-- Month-specific partitions (e.g. cost_events_2025_04) are created by the application.
CREATE TABLE IF NOT EXISTS cost_events_default
    PARTITION OF cost_events DEFAULT;

CREATE INDEX IF NOT EXISTS cost_events_tenant_time_idx
    ON cost_events (tenant_id, time DESC);

CREATE INDEX IF NOT EXISTS cost_events_agent_time_idx
    ON cost_events (agent_id, time DESC);

INSERT INTO schema_migrations (version) VALUES ('004')
    ON CONFLICT (version) DO NOTHING;
