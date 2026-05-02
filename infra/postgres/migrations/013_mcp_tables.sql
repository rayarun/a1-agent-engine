-- Migration 013: MCP Integration Tables
-- Adds support for external MCP server registration and token management

-- Table: mcp_servers
-- Stores registered external MCP servers per tenant
CREATE TABLE IF NOT EXISTS mcp_servers (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL,
    enabled     BOOLEAN DEFAULT true,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant ON mcp_servers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_tenant_enabled ON mcp_servers(tenant_id, enabled);

-- Table: mcp_tool_cache
-- Caches discovered tools from external MCP servers to avoid redundant discovery
CREATE TABLE IF NOT EXISTS mcp_tool_cache (
    id            TEXT PRIMARY KEY,
    mcp_server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    tenant_id     TEXT NOT NULL,
    tool_name     TEXT NOT NULL,
    description   TEXT,
    input_schema  JSONB,
    cached_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(mcp_server_id, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_mcp_tool_cache_server ON mcp_tool_cache(mcp_server_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_cache_tenant ON mcp_tool_cache(tenant_id);

-- Table: mcp_tokens
-- Bearer tokens for external clients to access the platform as an MCP server
-- Tokens are hashed (SHA-256) at rest for security
CREATE TABLE IF NOT EXISTS mcp_tokens (
    id          TEXT PRIMARY KEY,
    token_hash  TEXT NOT NULL UNIQUE,
    tenant_id   TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mcp_tokens_tenant ON mcp_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_expires_at ON mcp_tokens(expires_at) WHERE expires_at IS NOT NULL;
