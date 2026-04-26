# A1 Agent Engine: Project-Specific Guidelines

## Project Overview
**Enterprise Agentic PaaS** — A production-grade platform for building, deploying, and orchestrating AI-driven agent workflows. Four-tier capability hierarchy: **Tools** → **Skills** → **Sub-Agents** → **Agent Teams**, all backed by Temporal durable workflows, multi-service Go/Python architecture, and comprehensive observability.

---

## Core Architecture & Services

### Service Topology (Docker Compose)

| Service | Language | Port | Role |
|---------|----------|------|------|
| **Orchestration** | | | |
| temporal | - | 7233 (gRPC), 8233 (UI) | Durable workflow engine |
| **Control Plane** | | | |
| tool-registry | Go | 8086 | Tier-1: Tool CRUD & versioning |
| skill-catalog | Go | 8087 | Tier-2: Skill composition |
| skill-dispatcher | Go | 8085 | Tier-2: Tool invocation & hooks |
| sub-agent-registry | Go | 8084 | Tier-3: Sub-agent contracts |
| agent-registry | Go | 8088 | Tier-4: Agent manifest storage |
| **Execution Plane** | | | |
| api-gateway | Go | 8080 | Entry point; HMAC validation; token issuance |
| workflow-initiator | Go | 8081 | Temporal workflow dispatcher |
| agent-workers | Python | - | Temporal workers; ReAct loop execution |
| sandbox-manager | Go | 8082 | Ephemeral container lifecycle |
| llm-gateway | Go | 8083 | LLM provider proxy (LiteLLM) |
| **Frontend & Observability** | | | |
| agent-studio | Next.js | 3000 | Builder UI; Agent/Skill/Team editors; Ops Dashboard |
| dashboard | Python (Streamlit) | 8501 | SRE observability dashboard |
| **Data Plane** | | | |
| postgres | - | 5433 | Primary state store; pgvector; TimescaleDB |
| redis | - | 6379 | Session cache; rate limiting; idempotency |

---

## Development Setup

### Mandatory: Run Docker Compose First
Start the backing infrastructure (one-time only):
```bash
cd infra/local
docker-compose up -d
```

**Critical state:**
- Postgres runs migrations automatically on startup (`migrate` service depends on `postgres` health)
- Redis & Temporal are ready immediately
- Services that depend on `migrate` will wait for completion

### Frontend Development (Agent Studio)
**Frontend runs on the host, NOT in Docker.** This is intentional for rapid iteration.

```bash
# In apps/agent-studio
npm run dev
# Accesses backend services at localhost:8080, localhost:8086, etc.
```

The frontend is pre-configured with `NEXT_PUBLIC_*` env vars pointing to `localhost:*` ports (see `docker-compose.yml` build args).

### Go Services (Local Hot-Reload)
Use `air` for auto-restart on code changes:
```bash
cd services/api-gateway
go install github.com/cosmtrek/air@latest
air
```

Key Go services to run locally (in separate terminals):
- `api-gateway` (depends on `workflow-initiator`)
- `workflow-initiator` (depends on Temporal)
- `sandbox-manager`
- `llm-gateway`

### Python Services (Temporal Workers)
```bash
cd services/agent-workers
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m temporal.worker  # Adjust per your entrypoint
```

Workers connect to `temporal:7233` (inside docker-compose network). From host, use `localhost:7233` or configure `TEMPORAL_HOSTPORT=host.docker.internal:7233` if needed.

---

## Key Development Conventions

### 1. **Go Services: Port Assignment Convention**
- **8080**: API Gateway (entry point for external requests)
- **8081**: Workflow Initiator (routes to Temporal)
- **8082–8088**: Platform services (registry, dispatcher, orchestrator)
- Ports align with docker-compose; use same number for local dev

### 2. **Environment Variables & Config**
All services read from `.env` (in `infra/local/`) during Docker build:
- `DATABASE_URL` → postgres connection
- `TEMPORAL_HOSTPORT` → temporal gRPC address
- `WEBHOOK_HMAC_DISABLED=true` → local dev bypass (NEVER in prod)
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` → LLM provider credentials

For local development, override via shell:
```bash
export WEBHOOK_HMAC_DISABLED=true
export TEMPORAL_HOSTPORT=localhost:7233
```

### 3. **Database Access**
```bash
# Connect to local Postgres (default dev tenant)
psql -h localhost -p 5433 -U postgres -d agentplatform

# Set tenant context for RLS policies
SET LOCAL app.tenant_id = 'default-tenant';
SELECT * FROM agents;  -- Respects tenant isolation
```

### 4. **Temporal Debugging**
- Local UI: `http://localhost:8233`
- Check workflow history, task queue depth, pending signals
- Task queues: `default-tenant-agent-queue`, `default-tenant-team-queue`

### 5. **Multi-Language Design**
- **Go**: High-concurrency services (Gateway, Registry, Dispatcher). Use `net/http`, `Gin`, or `gRPC`.
- **Python**: Temporal workers, reasoning loops. Use `openai` SDK + Temporal Python SDK.
- **Next.js**: Frontend (Agent Studio). React Flow for DAG visualization.

**Rule**: Services communicate via REST/JSON (external) or gRPC (internal). Temporal handles orchestration plumbing.

---

## Docker vs. Local Execution

### When to Use Docker Compose
- **Stateful services** (Postgres, Redis, Temporal) — always Docker
- **Integration testing** — spin up full stack
- **Onboarding new team members** — `docker-compose up` is the canonical start

### When to Run Locally
- **API Gateway, Workflow Initiator, Sandbox Manager** — use `air` for hot-reload
- **Agent Studio frontend** — `npm run dev` (required for Tailwind/Next.js dev mode)
- **Python workers** — run in `venv` for debugger attachment and quick iteration

**Why split?** Debugging inside Docker is painful. Running services locally with your IDE allows instant breakpoints, watch variables, and tight feedback loops. Docker handles state; your IDE handles logic.

---

## Code Organization

```
services/
├── api-gateway/          # REST entry point; HMAC validation; OIDC token issuance
├── workflow-initiator/   # Routes to Temporal; translates manifests to workflows
├── agent-workers/        # Python Temporal workers; ReAct loop
├── llm-gateway/          # LLM provider proxy (LiteLLM config)
├── sandbox-manager/      # Ephemeral container provisioner
├── [registry services]/  # tool-, skill-, sub-agent-, agent-registry (CRUD + versioning)
└── skill-dispatcher/     # Slash-command parser; hook execution; tool routing

apps/
└── agent-studio/         # Next.js frontend (builders + ops dashboard)

packages/
├── go-shared/            # Shared Go models (AgentManifest, TeamManifest, SubAgentContract)
├── shared-protos/        # Protobuf definitions (gRPC contracts)
├── webhook-security/     # HMAC validation middleware (reusable)
└── team-sdk/             # Python: Team Manifest schema, sub-agent client helpers
```

---

## Temporal Workflow Patterns

### Single-Agent Execution
```
API Gateway → Workflow Initiator → StartAgentWorkflow → Agent Worker (ReAct loop)
```

1. **Context Hydration** → fetch memories from Redis/pgvector
2. **LLM Reasoning** → call via LLM Gateway
3. **Skill Dispatch** → Skill Dispatcher routes tool chains
4. **Tool Execution** → Sandbox Manager or internal microservices
5. **Observe & Loop** → repeat until agent concludes or HITL suspends

### Team Execution
```
API Gateway → Workflow Initiator → StartTeamWorkflow → Team Orchestrator (Python)
  ├─ Decompose goal (LLM)
  ├─ Fan-out to sub-agents (parallel)
  ├─ Each sub-agent runs ReAct loop
  └─ Synthesize results (LLM) → return
```

If any sub-agent triggers a **mutating tool**, entire team suspends pending HITL approval.

---

## Testing & Verification

### Unit Tests
```bash
cd services/api-gateway
go test ./...
```

### Integration Tests
Require a running Docker-compose stack:
```bash
docker-compose up -d
cd services/api-gateway
go test -tags=integration ./...
```

### Temporal Workflow Testing
Use Temporal's test harness:
```python
# services/agent-workers/test_workflows.py
from temporalio.testing import WorkflowEnvironment

async def test_react_loop():
    async with await WorkflowEnvironment.start_local() as env:
        handle = await env.client.start_workflow(
            AgentWorkflow.run,
            agent_id="test-agent",
            ...
        )
        result = await handle.result()
        assert result.status == "completed"
```

---

## Common Tasks

### Add a New Service
1. Create `services/my-service/` with Dockerfile
2. Add to `infra/local/docker-compose.yml` (specify port, env, depends_on)
3. Add HTTP/gRPC handler; register in Temporal task queue
4. Expose port via `docker-compose.yml` ports section

### Add a New Tool to Registry
1. POST to `POST /api/v1/tools` (tool-registry service)
2. Include JSON schema, auth_level, sandbox requirements
3. Status transitions: `draft` → `staged` → `active`
4. Skills can reference only `active` tools

### Deploy a New Agent Manifest
1. Build in Agent Studio UI or POST to `POST /api/v1/agents`
2. Lifecycle: `draft` → `staged` → `active`
3. Argo Rollouts manages canary; auto-rollback on latency regression

---

## Key Libraries & Dependencies

### Go
- `net/http`, `Gin` — REST handlers
- `temporalio/sdk-go` — Temporal client/workflow SDK
- `jackc/pgx` — PostgreSQL driver
- `go-redis/redis` — Redis client
- `protobuf` — gRPC contracts

### Python
- `temporalio` — Temporal SDK
- `openai` — LLM inference
- `pydantic` — data validation
- `httpx` — async HTTP client

### Frontend
- `next.js` — SSR framework
- `react-flow-renderer` — DAG/swimlane visualization
- `tailwindcss` — styling

---

## Debugging & Troubleshooting

### Service Not Starting?
1. Check logs: `docker-compose logs <service-name>`
2. Verify port not in use: `lsof -i :8080`
3. Postgres health: `docker-compose ps` (look for `healthy` status)

### Temporal Workflow Hung?
1. Check Temporal UI: `http://localhost:8233`
2. Look for "Activity Timeout" or "Heartbeat Timeout"
3. Check worker logs for exceptions in activity execution

### Frontend Can't Reach Backend?
1. Verify backend service running on correct port
2. Check `NEXT_PUBLIC_*` env vars in `.env` or browser DevTools Network tab
3. CORS headers set correctly in Go services (`Access-Control-Allow-Origin: *` for local dev)

### Database Migration Failed?
1. Check `migrate` service logs: `docker-compose logs migrate`
2. Inspect migration files in `infra/postgres/migrations/`
3. Reset: `docker-compose down -v && docker-compose up -d` (wipes data)

---

## Enforcement Rules

1. **Never commit `.env` files or secrets** — use AWS Secrets Manager in prod
2. **Frontend always runs on host** — never force it into Docker for local dev
3. **Services use gRPC internally, REST externally** — enforce via code review
4. **All agent execution is durable** (Temporal workflows) — no bare async/goroutines
5. **All tool invocation goes through Skill Dispatcher** — no direct tool calls
6. **PostgreSQL RLS is enforced** — never bypass with raw SQL or superuser creds
7. **HMAC validation mandatory** — disable only with `WEBHOOK_HMAC_DISABLED=true` locally
8. **TDD mandatory** — write tests before code; verify integration before merge

---

## Quick Reference: Starting a Fresh Session

```bash
# Terminal 1: Docker backing services
cd infra/local
docker-compose up -d

# Terminal 2: Frontend
cd apps/agent-studio
npm run dev  # http://localhost:3000

# Terminal 3: API Gateway
cd services/api-gateway
air  # auto-reload on code change

# Terminal 4: Workflow Initiator
cd services/workflow-initiator
air

# Terminal 5: Agent Workers
cd services/agent-workers
source venv/bin/activate
python -m temporal.worker  # or watchfiles...

# Verify:
curl http://localhost:8080/health  # API Gateway
curl http://localhost:3000         # Frontend
```

---

## References

- **Architecture**: [architecture.md](../../architecture.md)
- **Requirements**: [requirements.md](../../requirements.md)
- **Temporal Docs**: https://docs.temporal.io
- **Go Temporal SDK**: https://github.com/temporalio/sdk-go
- **Python Temporal SDK**: https://github.com/temporalio/sdk-python
