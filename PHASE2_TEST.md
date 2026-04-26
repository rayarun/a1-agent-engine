# Phase 2 Testing Guide

## Prerequisites

1. Start Docker services: `cd infra/local && docker-compose up -d`
2. Wait for migrations to complete (check logs with `docker-compose logs migrate`)
3. Verify admin-api is running: `curl -s http://localhost:8089/health`
4. Verify llm-gateway is running: `curl -s http://localhost:8083/health`

## Test LLM Configuration Endpoints

### 1. Get current LLM config
```bash
curl -s -H "Authorization: Bearer dev-admin-key" \
  http://localhost:8089/api/v1/admin/llm/config | jq
```

Expected response:
```json
{
  "anthropic_base_url": "https://api.anthropic.com/v1/messages",
  "anthropic_key_set": false,
  "openai_key_set": false,
  "mode": "mock"
}
```

### 2. Update LLM config
```bash
curl -s -X PUT -H "Authorization: Bearer dev-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "anthropic_base_url": "https://custom.anthropic.com/v1/messages",
    "anthropic_api_key": "test-key-123"
  }' \
  http://localhost:8089/api/v1/admin/llm/config | jq
```

Expected response: Updated config with `anthropic_key_set: true` and new URL

### 3. Verify config persisted (restart llm-gateway)
```bash
docker restart llm-gateway
sleep 2
curl -s http://localhost:8089/api/v1/admin/llm/config | jq
```

Should show the previously saved config (demonstrating DB persistence).

## Test System Agents Endpoints

### 1. List system agents
```bash
curl -s -H "Authorization: Bearer dev-admin-key" \
  http://localhost:8089/api/v1/admin/system-agents | jq
```

Expected response:
```json
{
  "agents": [],
  "count": 0
}
```

(Initially empty; populated by system agent seeder)

### 2. Create a system agent (insert via agent-registry)
```bash
curl -s -X POST -H "X-Tenant-ID: platform-system" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "manifest-assistant",
    "name": "Manifest Assistant",
    "version": "1.0.0",
    "system_prompt": "You are a helpful assistant for agent manifest creation.",
    "model": "claude-opus-4-7",
    "max_iterations": 10,
    "memory_budget_mb": 512,
    "skills": []
  }' \
  http://localhost:8088/api/v1/agents | jq
```

### 3. Get system agent detail
```bash
curl -s -H "Authorization: Bearer dev-admin-key" \
  http://localhost:8089/api/v1/admin/system-agents/manifest-assistant | jq
```

### 4. Update system agent
```bash
curl -s -X PUT -H "Authorization: Bearer dev-admin-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Manifest Assistant v2",
    "version": "2.0.0",
    "system_prompt": "Updated system prompt",
    "model": "claude-opus-4-7",
    "max_iterations": 15,
    "memory_budget_mb": 1024,
    "status": "active"
  }' \
  http://localhost:8089/api/v1/admin/system-agents/manifest-assistant | jq
```

## Verification Checklist

- [ ] LLM config can be retrieved
- [ ] LLM config can be updated
- [ ] LLM config survives service restart (DB persisted)
- [ ] System agents can be listed
- [ ] System agents can be retrieved by ID
- [ ] System agents can be updated
- [ ] Auth middleware rejects requests without Bearer token
- [ ] Invalid Bearer token returns 401

## Cleanup

```bash
cd infra/local && docker-compose down
```
