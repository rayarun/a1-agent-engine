-- Migration 023: LLM Gateway cost tracking
-- Tracks costs per LLM API call: provider, model, tokens, cost
-- Partitioned monthly for scalability

CREATE TABLE IF NOT EXISTS llm_cost_events (
    id              BIGSERIAL,
    time            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tenant_id       TEXT NOT NULL,
    provider        TEXT NOT NULL,  -- e.g., "anthropic", "openai", "google", "custom-proxy"
    model           TEXT NOT NULL,  -- e.g., "claude-opus-4-7", "gpt-4o", "gemini-2.0-flash"
    request_id      TEXT,           -- Unique request identifier for deduplication
    input_tokens    INT NOT NULL DEFAULT 0,
    output_tokens   INT NOT NULL DEFAULT 0,
    cache_creation_tokens INT NOT NULL DEFAULT 0,  -- Anthropic prompt caching
    cache_read_tokens INT NOT NULL DEFAULT 0,      -- Anthropic prompt caching
    cost_usd_cents  INT NOT NULL DEFAULT 0,        -- Cost in cents (e.g., 1234 = $12.34)
    latency_ms      INT NOT NULL DEFAULT 0,        -- Request latency for monitoring
    status          TEXT NOT NULL DEFAULT 'success', -- 'success' or 'error'
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (id, time)
) PARTITION BY RANGE (time);

-- Default partition for out-of-range timestamps
CREATE TABLE IF NOT EXISTS llm_cost_events_default
    PARTITION OF llm_cost_events DEFAULT;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS llm_cost_events_tenant_time_idx
    ON llm_cost_events (tenant_id, time DESC);

CREATE INDEX IF NOT EXISTS llm_cost_events_provider_model_idx
    ON llm_cost_events (provider, model);

CREATE INDEX IF NOT EXISTS llm_cost_events_request_id_idx
    ON llm_cost_events (request_id);

-- Add llm-specific columns to cost_events (for unified cost reporting)
ALTER TABLE cost_events ADD COLUMN IF NOT EXISTS
    llm_provider TEXT;

ALTER TABLE cost_events ADD COLUMN IF NOT EXISTS
    llm_model TEXT;

ALTER TABLE cost_events ADD COLUMN IF NOT EXISTS
    llm_cost_usd_cents INT DEFAULT 0;

INSERT INTO schema_migrations (version) VALUES ('023')
    ON CONFLICT (version) DO NOTHING;
