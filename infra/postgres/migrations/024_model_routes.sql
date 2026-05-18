-- Copyright 2026 Arun Ray
-- Licensed under the Apache License, Version 2.0

CREATE TABLE model_routes (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  model_pattern TEXT NOT NULL,
  endpoint_url TEXT NOT NULL,
  api_key TEXT,
  provider_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);

CREATE INDEX idx_model_routes_tenant_id ON model_routes(tenant_id);
CREATE INDEX idx_model_routes_tenant_status ON model_routes(tenant_id, status);
CREATE INDEX idx_model_routes_pattern ON model_routes(model_pattern);

-- Enable RLS
ALTER TABLE model_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY model_routes_tenant_isolation ON model_routes
  USING (tenant_id = current_setting('app.tenant_id')::text OR current_setting('app.tenant_id')::text = 'admin');

COMMENT ON TABLE model_routes IS 'Maps model name patterns to LLM endpoints for dynamic routing';
COMMENT ON COLUMN model_routes.model_pattern IS 'Glob pattern for model names (e.g., claude-*, gpt-*, gemma:*)';
COMMENT ON COLUMN model_routes.endpoint_url IS 'URL where this model is deployed';
COMMENT ON COLUMN model_routes.provider_type IS 'Provider type: anthropic, openai, google, ollama, custom';
COMMENT ON COLUMN model_routes.api_key IS 'Optional API key for authentication (encrypted at rest)';
