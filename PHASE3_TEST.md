# Phase 3 Testing Guide: Admin Console Frontend Integration

## Prerequisites

Complete Phase 2 first. Services and database must be running:

```bash
# Terminal 1: Docker backing services
cd infra/local && docker-compose up -d

# Verify migrations completed
docker-compose logs migrate | tail -5
```

## Local Development Setup

### Start Services (local)

```bash
# Terminal 2: Admin API service
cd services/admin-api && air

# Terminal 3: Admin Console frontend (Next.js dev server)
cd apps/admin-console && npm run dev
```

Admin Console will be available at **http://localhost:3001**

## Test Workflow

### 1. Login
- Open http://localhost:3001
- Should redirect to `/login`
- Enter `dev-admin-key` (the default admin key from docker-compose)
- Click "Sign in"
- Should redirect to `/dashboard` and store key in sessionStorage

### 2. Dashboard
```
Expected:
- Active Tenants card shows count (0 initially or from previous Phase 2 setup)
- Tenants table displays all tenants from admin-api
- Service health badge
- Recent events placeholder
```

### 3. Tenants Page
```
GET /api/v1/admin/tenants
- Displays list of existing tenants
- Create Tenant button opens form
- Can create new tenant with display name + quota settings
- Suspend/Activate actions work
```

### 4. LLM Config Page
```
GET /api/v1/admin/llm/config
- Loads current LLM config from backend
- Mode selector (mock/anthropic/openai)
- Anthropic fields shown when mode = anthropic

PUT /api/v1/admin/llm/config
- Update base URL
- Enter new API key (shows as masked if already set)
- Save button → success/error feedback
- Model Access Control table displays (stubbed for now)
```

Test sequence:
```bash
# Verify current config
curl -s -H "Authorization: Bearer dev-admin-key" \
  http://localhost:8089/api/v1/admin/llm/config | jq

# Update via UI:
# 1. Navigate to /llm-config
# 2. Change anthropic_base_url to: https://custom.anthropic.com/v1/messages
# 3. Enter test API key (or leave blank)
# 4. Click Save Configuration
# 5. Verify success message appears

# Verify updated config persists
curl -s -H "Authorization: Bearer dev-admin-key" \
  http://localhost:8089/api/v1/admin/llm/config | jq
```

### 5. System Agents Page
```
GET /api/v1/admin/system-agents
- Lists all system agents (from platform-system tenant)
- Initially empty (no seeded agents yet)

GET /api/v1/admin/system-agents/{id}
- Click agent to view details
- Shows name, version, model, system prompt

PUT /api/v1/admin/system-agents/{id}
- Click "Edit Manifest"
- Modal opens with editable fields
- Update name, version, system_prompt, model, iterations, memory budget
- Click "Save Changes"
- Verify agent details update
```

Test sequence:
```bash
# First, create a system agent via agent-registry (from Phase 2):
curl -s -X POST -H "X-Tenant-ID: platform-system" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "test-agent",
    "name": "Test Agent",
    "version": "1.0.0",
    "system_prompt": "You are a test agent.",
    "model": "claude-opus-4-7",
    "max_iterations": 10,
    "memory_budget_mb": 512,
    "skills": []
  }' \
  http://localhost:8088/api/v1/agents | jq

# Navigate to /system-agents in admin console
# Should show "Test Agent" in the agent list
# Click to view details
# Edit manifest: change version to 1.0.1
# Save
# Verify version updates
```

## Verification Checklist

### Auth
- [ ] Unauthenticated access redirects to /login
- [ ] Invalid key shows error message
- [ ] Valid key logs in and redirects to dashboard
- [ ] Logout clears sessionStorage and redirects to /login

### Dashboard
- [ ] Loads without errors
- [ ] Tenants table populates from API
- [ ] Cards display (active tenants, LLM mode, service health)

### Tenants
- [ ] Lists all tenants
- [ ] Create tenant form works
- [ ] Suspend/activate toggles work
- [ ] Toast/success messages appear

### LLM Config
- [ ] Config loads on page load
- [ ] Mode selector works
- [ ] Save button works with success feedback
- [ ] API key masking works (shows •• if already set)
- [ ] Config persists after page reload

### System Agents
- [ ] Agents list loads
- [ ] Click agent shows details
- [ ] Edit button opens modal
- [ ] Save changes persists to database
- [ ] Manifest fields display correctly

## Cleanup

```bash
cd infra/local && docker-compose down
```

## Known Limitations (Phase 3)

- Model Access Control table is static (implemented in Phase 4)
- Deployment transition not yet implemented (Phase 5)
- Executions, Cost, Audit pages are stubs (Phase 4)
- No real-time updates or websockets yet

## Docker Build Testing

To test the production Docker build:

```bash
docker build -f apps/admin-console/Dockerfile -t admin-console:test .

# Or via docker-compose:
docker-compose up admin-console
# Should start on port 3001
```
