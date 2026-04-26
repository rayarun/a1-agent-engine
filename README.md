# A1 Agent Engine

**Enterprise Agentic PaaS** — A production-grade platform for building, deploying, and orchestrating AI-driven agent workflows with durable execution, multi-tenancy, and comprehensive observability.

## 🎯 What is A1 Agent Engine?

A1 Agent Engine is a complete platform for agentic AI applications. It enables:

- **Agent Workflows** — Define AI agents with reasoning loops, memory, and tool access
- **Team Orchestration** — Coordinate multi-agent teams with parallel execution and result synthesis
- **Durable Execution** — All workflows backed by Temporal for crash recovery and HITL integration
- **Multi-Tenancy** — Tenant isolation via PostgreSQL RLS, Redis namespacing, and per-tenant Temporal queues
- **Tool Ecosystem** — Build and compose tools, organize into skills, version-control everything
- **Enterprise Security** — HMAC webhook validation, OIDC token issuance, JIT credential fetching
- **Real-Time Observability** — Stream agent events as Server-Sent Events or WebSocket, monitor via Temporal UI
- **AI-Assisted Agent Design** — Embedded Manifest Assistant helps no-code users design agent manifests conversationally, recommending skills and drafting system prompts in real-time

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Go 1.22+
- Python 3.9+ with venv
- Node.js 18+ with npm

### Setup (5 minutes)

```bash
# 1. Start backing services (Postgres, Redis, Temporal)
cd infra/local
docker-compose up -d

# 2. Frontend (Terminal 1)
cd apps/agent-studio
npm run dev
# → http://localhost:3000

# 3. API Gateway (Terminal 2)
cd services/api-gateway
go install github.com/cosmtrek/air@latest
air
# → http://localhost:8080

# 4. Workflow Initiator (Terminal 3)
cd services/workflow-initiator
air

# 5. Agent Workers (Terminal 4)
cd services/agent-workers
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m temporal.worker

# 6. Verify health
curl http://localhost:8080/health
```

**Note:** Frontend runs on host, not Docker, for rapid development iteration.

## 🏗️ Architecture

### Four-Tier Capability Hierarchy

```
Tools (JSON schemas, auth levels, sandbox requirements)
  ↓
Skills (Tool compositions, versioning, hooks)
  ↓
Sub-Agents (Reusable agent contracts, team members)
  ↓
Agent Teams (Orchestration, decomposition, synthesis)
```

### Service Topology

| Service | Port | Language | Role |
|---------|------|----------|------|
| **Orchestration** | | | |
| Temporal | 7233/8233 | - | Durable workflow engine |
| **Execution** | | | |
| API Gateway | 8080 | Go | Entry point; HMAC validation |
| Workflow Initiator | 8081 | Go | Temporal workflow dispatcher |
| Agent Workers | - | Python | Temporal workers; ReAct loop |
| LLM Gateway | 8083 | Go | LLM provider proxy (LiteLLM) |
| Sandbox Manager | 8082 | Go | Ephemeral container lifecycle |
| **Control Plane** | | | |
| Tool Registry | 8086 | Go | Tool CRUD & versioning |
| Skill Catalog | 8087 | Go | Skill composition |
| Skill Dispatcher | 8085 | Go | Tool routing; hooks |
| Sub-Agent Registry | 8084 | Go | Sub-agent contracts |
| Agent Registry | 8088 | Go | Agent manifests |
| **Frontend & Observability** | | | |
| Agent Studio | 3000 | Next.js | Builder UI; Ops Dashboard |
| Dashboard | 8501 | Streamlit | SRE observability |
| **Data** | | | |
| PostgreSQL | 5433 | - | Primary state store; pgvector; RLS |
| Redis | 6379 | - | Session cache; rate limiting |

### Execution Flow

#### Single-Agent Workflow
```
API Gateway → Workflow Initiator → StartAgentWorkflow → Agent Worker (ReAct loop)
  ↓
1. Fetch context from Redis/pgvector
2. LLM reasoning via LLM Gateway
3. Skill dispatch (tool routing)
4. Tool execution (Sandbox Manager or internal)
5. Loop until completion or HITL signal
```

#### Team Workflow
```
API Gateway → Workflow Initiator → StartTeamWorkflow → Team Orchestrator
  ├─ LLM decomposes goal into sub-tasks
  ├─ Fan-out: Each sub-agent runs ReAct loop (parallel)
  ├─ Mutating tool? → Entire team suspends pending HITL
  └─ LLM synthesizes results → Return
```

## 📂 Project Structure

```
a1-agent-engine/
├── services/                    # Core microservices
│   ├── api-gateway/            # REST entry point
│   ├── workflow-initiator/      # Temporal dispatcher
│   ├── agent-workers/          # Python Temporal workers
│   ├── llm-gateway/            # LLM provider proxy
│   ├── sandbox-manager/        # Container lifecycle
│   ├── tool-registry/          # Tool CRUD
│   ├── skill-catalog/          # Skill composition
│   ├── skill-dispatcher/       # Tool routing
│   ├── sub-agent-registry/     # Sub-agent contracts
│   └── agent-registry/         # Agent manifests
│
├── apps/
│   └── agent-studio/           # Next.js frontend
│
├── packages/
│   ├── go-shared/              # Shared Go models
│   ├── shared-protos/          # Protobuf gRPC contracts
│   ├── webhook-security/       # HMAC validation
│   └── team-sdk/               # Python team manifest schema
│
├── infra/
│   └── local/                  # Docker Compose setup
│       ├── docker-compose.yml
│       └── .env
│
└── .claude/
    └── CLAUDE.md              # Project-specific guidelines
```

## 🔑 Key Features

### Durability & Crash Recovery
All agent execution backed by Temporal workflows—resumable from last checkpoint on crash.

### Multi-Tenancy
- **PostgreSQL RLS**: Row-level security with `SET LOCAL app.tenant_id`
- **Redis Namespacing**: Per-tenant cache isolation via key prefixes
- **Temporal Task Queues**: Per-tenant queues for isolation and scaling
- **Vector DB Partitioning**: Per-tenant embeddings storage

### Enterprise Security
- **HMAC Webhook Validation**: Secure inbound event verification
- **OIDC Token Issuance**: Industry-standard identity federation
- **JIT Credential Fetching**: Credentials retrieved at activity time, never stored

### Real-Time Streaming
- **Server-Sent Events (SSE)**: Polling-based event streaming
- **WebSocket**: Full-duplex agent communication
- **Event Models**: Structured events for reasoning steps, tool calls, results

### Observability
- **Temporal UI**: Workflow history, task queue depth, signal monitoring
- **Streamlit Dashboard**: SRE-focused metrics and logs
- **Structured Logging**: JSON logs with tenant context

### AI-Assisted Agent Design (Manifest Assistant)

The **Manifest Assistant** is a platform system agent embedded in the Agent Creation UI. It helps no-code users design agent manifests conversationally:

1. **Open Agent Creation Dialog** → Manifest Assistant panel appears on the right
2. **Describe Your Agent** → E.g., "I need a customer support agent that handles ticket routing"
3. **Assistant Recommends**:
   - ✨ **System Prompt Draft** — Persona-driven prompt tailored to your needs
   - 🛠️ **Skill Recommendations** — Exact skills from your catalog with explanations
   - 🔧 **Skill Gaps** — Proposes new skills to create if the catalog lacks capabilities
4. **Real-Time Streaming** → Responses appear as they're computed via Server-Sent Events
5. **One-Click Apply** → Click "Apply to Form" to auto-populate system prompt and skills

**How It Works Internally:**
- Frontend injects the live skill/tool catalog as context (`<catalog>` XML block) into the first message
- Manifest Assistant runs on an isolated `platform-system-agent-queue` (separate from user agent workflows)
- Multi-turn conversation preserves context via session ID
- LLM output is parsed to extract structured sections (`## System Prompt Draft`, `## Recommended Skills`)

## 🛠️ Development

### Running Tests

```bash
# Unit tests
cd services/api-gateway
go test ./...

# Integration tests (requires docker-compose running)
go test -tags=integration ./...

# Temporal workflow tests
cd services/agent-workers
pytest
```

### Adding a New Service

1. Create `services/my-service/` with Dockerfile
2. Add to `infra/local/docker-compose.yml` (port, env, depends_on)
3. Implement HTTP/gRPC handlers
4. Register activity or workflow with Temporal if needed

### Adding a Tool

```bash
POST /api/v1/tools
Content-Type: application/json

{
  "name": "send-email",
  "description": "Send an email to a recipient",
  "input_schema": {
    "type": "object",
    "properties": {
      "to": {"type": "string"},
      "subject": {"type": "string"},
      "body": {"type": "string"}
    },
    "required": ["to", "subject", "body"]
  },
  "auth_level": "user",
  "sandbox_required": false
}
```

Tool lifecycle: `draft` → `staged` → `active`

## 🔍 Debugging

### Check Service Health
```bash
curl http://localhost:8080/health
```

### Connect to Postgres
```bash
psql -h localhost -p 5433 -U postgres -d agentplatform
SET LOCAL app.tenant_id = 'default-tenant';
SELECT * FROM agents;
```

### Monitor Temporal
- UI: http://localhost:8233
- Check workflow history, task queue depth, pending signals

### Docker Service Logs
```bash
cd infra/local
docker-compose logs -f api-gateway
docker-compose logs -f temporal
```

## 📖 Documentation

- **[CLAUDE.md](./.claude/CLAUDE.md)** — Project setup, conventions, enforcement rules
- **[architecture.md](./architecture.md)** — Detailed system design
- **[requirements.md](./requirements.md)** — Functional & non-functional requirements

## 🧠 Design Decisions

### Temporal as Single Execution Path
All agents (simple and complex) execute through Temporal. Profiling showed ~200ms overhead is negligible for realistic agents (LLM calls dominate). Trade-off: durability and operational consistency win.

### Multi-Tenant by Default
Every resource (agent, skill, tool, memory) belongs to a tenant. Isolation enforced at database, cache, and queue layers.

### Per-Sub-Agent Model Selection
Different sub-agents can target different LLM providers/models via the LLM Gateway, enabling tenant-specific provider preferences without per-tenant infrastructure complexity.

## 🤝 Contributing

1. **Mandatory TDD**: Write tests before code; verify integration before merge
2. **Surgical Precision**: Only modify code strictly related to the task
3. **No Drive-By Refactoring**: Keep diffs minimal and clean
4. **Security First**: Review OWASP top 10 vulnerabilities; validate at system boundaries

## 📝 License

[Add your license here]

## 💬 Support

For issues and feature requests, see the GitHub Issues tab or contact the maintainers.

---

**Built with Go, Python, Next.js, Temporal, PostgreSQL, and Redis.**
