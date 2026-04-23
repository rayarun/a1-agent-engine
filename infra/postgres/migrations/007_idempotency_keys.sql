-- Migration 007: Webhook idempotency keys (Postgres backup; Redis is primary)
-- Redis holds a 24h TTL copy. This table is the durable fallback and audit trail.

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key             TEXT NOT NULL,
    tenant_id       UUID NOT NULL,
    workflow_id     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, key)
);

-- Expire rows older than 24 hours via a scheduled DELETE.
-- The cost-attribution cron or a dedicated pg_cron job should run:
--   DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours';
CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx
    ON idempotency_keys (created_at);

INSERT INTO schema_migrations (version) VALUES ('007')
    ON CONFLICT (version) DO NOTHING;
