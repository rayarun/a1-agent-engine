# Enterprise Agentic PaaS: Architecture & Design Spec

![Enterprise PaaS Overarching Architecure Diagram](/Users/arun.ray/.gemini/antigravity/brain/e3d6f27f-a60a-4087-8a93-ac31d5aff9b4/artifacts/rich_architecture_diagram.png)

## Platform Vision & Capability Requirements

### Architecture Vision
To provide a secure, highly-scalable, and developer-friendly Platform-as-a-Service (PaaS) that transforms how enterprises build and operate AI-driven automation. The platform is structured around a four-tier capability hierarchy — **Tools**, **Skills**, **Sub-Agents**, and **Agent Teams** — that separates primitive execution from governed composition, and single-agent reasoning from coordinated multi-agent workflows. This architecture enables platform engineers to govern every primitive while domain experts assemble sophisticated, self-orchestrating workflows without writing code.

### Core Capability Goals
Architecturally, the system is designed from the ground up to fulfill several strict enterprise requirements:
- **Composable Agent Workforce**: A four-tier hierarchy (Tools → Skills → Sub-Agents → Agent Teams) allows incremental composition — from raw API operations through governed skill bundles to coordinated specialist pipelines that decompose and solve complex multi-domain tasks in parallel.
- **Enterprise-Grade Resilience**: Guarantee zero-data-loss execution via **Durable ReAct loops** and **Team Orchestration** backed by Temporal. Sub-agent failures within a team are retried independently; the team orchestrator resumes without restarting the entire workflow.
- **Zero-Trust Security by Design**: Every tool invocation uses a short-lived, scoped OIDC token. All inter-service communication runs over mTLS. Inbound webhooks require HMAC-SHA256 signature validation. Secrets rotate automatically with leak-detection scanning.
- **Human-in-the-Loop (HITL)**: Any agent or team member invoking a mutating tool suspends the entire team workflow pending MFA-backed approval, with full execution trace context visible to the Approver.
- **Governed Extensibility Without Lock-in**: Security-reviewed tool registration, independently versioned skills, and per-sub-agent model selection prevent both accidental capability sprawl and vendor lock-in.
- **Operational Accountability**: SLOs are tracked at workflow, skill, and tool granularity. Every platform action is costed and attributed per tenant, agent, and skill. Incident runbooks and SLO burn-rate alerts ensure predictable operation at enterprise scale.

---

## 1. Logical Architecture
The logical architecture decouples the definition of an agent from its execution across six planes. It separates primitive capability registration (Tools) from governed composition (Skills), and single-agent reasoning from coordinated multi-agent execution (Agent Teams). A dedicated Security Plane enforces zero-trust policy across all planes as a cross-cutting concern.

```mermaid
graph TD
    subgraph Control_Plane
        UI[Agent Studio UI] --> ToolRegistry[Tool Registry]
        UI --> SkillCatalog[Skill Catalog]
        SkillCatalog --> SubAgentRegistry[Sub-Agent Registry]
        SubAgentRegistry --> TeamManifestRegistry[Team Manifest Registry]
        TeamManifestRegistry --> AgentRegistry[Agent Manifest Registry]
        AgentRegistry --> Policy[RBAC and Policy Engine]
        UI --> Simulator[Agent Testing Simulator]
        UI --> LifecycleMgr[Lifecycle and Deployment Manager]
    end

    subgraph Orchestration_Plane
        Gateway[Agent API Gateway] --> WebhookValidator[Webhook HMAC Validator]
        WebhookValidator --> Workflow[Temporal Workflow Engine]
        Workflow --> AgentWorker[Single-Agent Worker]
        Workflow --> TeamOrchestrator[Team Orchestrator]
        TeamOrchestrator --> SubAgentDispatcher[Sub-Agent Dispatcher]
        SubAgentDispatcher -.->|parallel fan-out| AgentWorker
        AgentWorker --> HITL[HITL and Signal Manager]
    end

    subgraph Execution_Plane
        SkillDispatcher[Skill Dispatcher and Hook Engine]
        Router[Tool Router]
        Sandbox[Ephemeral Sandboxes]
        InternalAPI[Internal Go Microservices]
    end

    subgraph Data_Plane
        ShortMem[Session Cache - Redis]
        LongMem[Vector DB - tenant-partitioned]
        LifecycleStore[Lifecycle State Store]
        CostStore[Cost Attribution Store]
        OTel[Observability and Audit - OTel]
    end

    subgraph Security_Plane
        mTLS[Service Mesh - mTLS via Istio]
        STS[Internal STS - short-lived OIDC tokens]
        SecretRotation[Secret Rotation Service]
    end

    subgraph Inference_Plane
        LLMRouter[LLM API Gateway]
        PublicLLM[Managed LLMs: OpenAI / Anthropic]
        LocalLLM[Local Inference: vLLM / Ollama]
    end

    AgentRegistry -.-> Gateway
    AgentWorker --> SkillDispatcher
    SkillDispatcher --> Router
    Router --> Sandbox
    Router --> InternalAPI
    AgentWorker --> ShortMem
    AgentWorker --> LongMem
    AgentWorker --> OTel
    TeamOrchestrator --> CostStore
    LifecycleMgr --> LifecycleStore
    AgentWorker --> LLMRouter
    LLMRouter --> PublicLLM
    LLMRouter --> LocalLLM
    Security_Plane -.->|cross-cutting| Orchestration_Plane
    Security_Plane -.->|cross-cutting| Execution_Plane
```

- **Control Plane**: The command center for all four tiers. Platform engineers register Tools via the Tool Registry (security review required). Skill Developers compose Tools into Skills in the Skill Catalog. Sub-Agent Developers define capability contracts in the Sub-Agent Registry. No-Code creators wire Sub-Agents into Team Manifests and Agent Manifests. The Lifecycle Manager governs state transitions and deployment strategies across all tiers.
- **Orchestration Plane (The Brain)**: The Agent API Gateway validates inbound requests (HMAC on webhooks) and routes to the Temporal Workflow Engine. For single agents, the engine dispatches to an Agent Worker. For teams, it dispatches to the Team Orchestrator, which fans out to the Sub-Agent Dispatcher, launching parallel Agent Workers per sub-agent. HITL signals propagate team-wide, suspending all parallel branches.
- **Execution Plane (The Hands)**: The Skill Dispatcher receives slash-command-style invocations, validates arguments, fires pre/post hooks, and routes tool chains through the Tool Router. The Tool Router dispatches to Ephemeral Sandboxes (arbitrary code) or Internal Go Microservices (typed platform APIs).
- **Data Plane**: Redis for short-term session context; pgvector (tenant-partitioned) for long-term semantic memory; a Lifecycle State Store for immutable audit trails of all four-tier transitions; a Cost Attribution Store (TimescaleDB) for per-tenant/agent/skill cost metering; OTel collectors for unified observability.
- **Security Plane (Cross-Cutting)**: Istio enforces mTLS between all services. The Internal STS issues short-lived (5-min TTL), scoped OIDC tokens for every agent and sub-agent invocation. The Secret Rotation Service manages automated credential rotation and leak detection.
- **Inference Plane**: A centralized LLM API Gateway (e.g., LiteLLM) proxies all model requests. Model selection is configurable per sub-agent — members of the same team can target different providers without changing the team manifest structure.

## 2. Physical Architecture (AWS Native)
Maps the logical components to an AWS cloud-native environment, utilizing managed services.

```mermaid
graph LR
    Developer(Platform Developer) --> ALB[AWS ALB]
    User(End User or Webhook) --> ALB
    ALB --> EKS_Ingress[Nginx Ingress]

    subgraph EKS_Cluster
        AdminUI_Pod[Agent Studio UI Pods]
        API_Pod[Platform API Pods - with Istio sidecar]
        Worker_Pod[Agent Worker Pods - with Istio sidecar]
        TeamOrch_Pod[Team Orchestrator Pods - with Istio sidecar]
        SubAgentReg_Pod[Sub-Agent Registry Pods]
        SkillDisp_Pod[Skill Dispatcher Pods]
        CostAttr_Pod[Cost Attribution Pods]
        Tool_Pod[Internal Microservice Pods]
    end

    subgraph Security_Perimeter
        Sandbox[Isolated Docker Containers]
    end

    subgraph Managed_Services
        RDS(Amazon RDS - PostgreSQL with tenant schemas and RLS)
        ElastiCache(ElastiCache Redis - session cache and idempotency store)
        S3(Amazon S3 - vector archive and WAL backups)
    end

    EKS_Ingress --> AdminUI_Pod
    EKS_Ingress --> API_Pod
    AdminUI_Pod --> API_Pod
    API_Pod --> Temporal_Service{Temporal Cluster}
    Temporal_Service --> Worker_Pod
    Temporal_Service --> TeamOrch_Pod
    TeamOrch_Pod --> Worker_Pod
    Worker_Pod --> SkillDisp_Pod
    SkillDisp_Pod --> Tool_Pod
    Worker_Pod --> SubAgentReg_Pod
    Worker_Pod --> LLM((LLM Provider API))
    Worker_Pod --> Sandbox
    CostAttr_Pod --> RDS
    Temporal_Service --> RDS
    Worker_Pod --> ElastiCache
    Worker_Pod --> RDS
    Worker_Pod --> S3
```

- **Ingress**: Traffic flows through AWS ALB to Nginx Ingress on EKS. Webhook events from external systems (Datadog, PagerDuty) enter through the same ALB; the API Gateway validates HMAC signatures before dispatching to Temporal.
- **Compute (EKS)** — all pods run Istio sidecars enforcing mTLS:
  - Agent Studio UI Pods (Next.js)
  - Platform API Pods (Go) — HMAC validation, RBAC, OIDC token issuance
  - Agent Worker Pods (Python/Temporal) — single-agent ReAct loops
  - Team Orchestrator Pods (Python/Temporal) — team decomposition, fan-out, synthesis
  - Sub-Agent Registry Pods (Go) — contract storage and lookup
  - Skill Dispatcher Pods (Go) — slash-command parsing, hook execution, tool routing
  - Cost Attribution Pods (Go) — OTel span consumption, quota enforcement
  - Internal Microservice Pods (Go) — primitive platform tools
- **Isolation Layer**: Arbitrary code execution runs in ephemeral Docker Containers in an isolated VPC subnet with blocked lateral network movement.
- **Managed Persistence**:
  - Amazon RDS (PostgreSQL) with per-tenant schemas, RLS, and TimescaleDB extension for cost time-series data
  - Amazon ElastiCache (Redis) for session context, rate limiting, and webhook idempotency key cache (24h TTL)
  - Amazon S3 for cold-storage archival of Vector DB embeddings and continuous WAL backups (RPO ≤ 15 min)

## 3. Component Design

```mermaid
classDiagram
    class AgentStudio {
        +renderManifestBuilder()
        +renderToolRegistry()
        +renderSkillBuilder()
        +renderSubAgentRegistry()
        +renderTeamBuilder()
        +renderOperationsDashboard()
        +runSimulationSession(mode: single|team)
    }
    class PlatformGateway {
        +submitTask(agentId, payload)
        +triggerEvent(topic, payload)
        +validateWebhookHMAC(body, sig, timestamp)
        +enforceQuota(tenantId, resourceType)
        +issueAgentToken(agentId, allowedSkills)
    }
    class WorkflowInitiator {
        +fetchManifest(agentId)
        +startAgentWorkflow(manifest, payload)
        +startTeamWorkflow(teamManifest, payload)
    }
    class TemporalWorker {
        +executeReActLoop()
        +executeTeamWorkflow()
        +dispatchSubAgent(contractId, task)
        +synthesizeTeamResults(results[])
    }
    class SubAgentRegistry {
        +register(contract)
        +resolve(agentId)
        +listBySkill(skillId)
        +transition(agentId, targetState)
    }
    class TeamOrchestrator {
        +decomposeGoal(prompt)
        +fanOut(subAgents[])
        +collectResults()
        +synthesize(results[])
        +propagateHITL(workflowId)
    }
    class SkillDispatcher {
        +parseCommand(slashCmd)
        +validateArgs(schema)
        +executeHooks(phase, context)
        +route(toolChain)
    }
    class HookEngine {
        +registerHook(skill, phase, handler)
        +fire(phase, context)
    }
    class WebhookValidator {
        +verifyHMAC(body, sig, secret)
        +checkReplay(timestamp)
        +deduplicateIdempotency(key)
    }
    class LifecycleManager {
        +transition(resourceId, tier, targetState)
        +deployCanary(manifest, pct)
        +rollback(resourceId)
        +auditTransition(event)
    }
    class CostAttributionService {
        +record(tenantId, agentId, skillId, tokens, sandboxMs)
        +getReport(tenantId)
        +checkQuota(tenantId)
    }
    class ContextHydrator {
        +fetchRecentSession()
        +queryVectorDB(intent, tenantId)
        +injectSkillSOPs(skills)
    }
    class SandboxManager {
        +provisionEnvironment()
        +executeCode(code, envVars)
        +destroyEnvironment()
    }

    AgentStudio --> PlatformGateway
    PlatformGateway --> WebhookValidator
    PlatformGateway --> WorkflowInitiator
    WorkflowInitiator --> TemporalWorker
    WorkflowInitiator --> TeamOrchestrator
    TeamOrchestrator --> SubAgentRegistry
    TeamOrchestrator --> TemporalWorker
    TemporalWorker --> SkillDispatcher
    SkillDispatcher --> HookEngine
    TemporalWorker --> ContextHydrator
    TemporalWorker --> SandboxManager
    TemporalWorker --> CostAttributionService
    LifecycleManager --> SubAgentRegistry
```

- **Agent Studio (Next.js)**: Frontend for all four builder surfaces — Tool Registry, Skill Builder, Sub-Agent Registry, Team Manifest Editor — plus simulation in single-agent or team mode and the Operations Dashboard.
- **Platform Gateway (Go)**: Edge entry point. Validates HMAC signatures on webhook events, enforces per-tenant quotas, issues scoped OIDC tokens for agent executions, and routes to Workflow Initiator.
- **Webhook Validator (Go)**: Standalone middleware inside the Gateway. Computes and compares HMAC-SHA256 signatures, validates timestamps (anti-replay), and deduplicates idempotency keys via Redis.
- **Workflow Initiator (Go)**: Translates platform-level manifest IDs into Temporal workflow requests. Routes single-agent requests to `AgentWorkflow` and team requests to `TeamWorkflow`.
- **Team Orchestrator (Python/Temporal)**: Implements `TeamWorkflow`. Decomposes goals via LLM, fans out to sub-agent workers in parallel via `SubAgentDispatcher`, collects typed results, synthesizes the final response, and propagates HITL suspension team-wide.
- **Sub-Agent Registry (Go)**: Stateless CRUD service backed by PostgreSQL. Stores versioned sub-agent contracts. Resolves capability contracts at workflow start time.
- **Temporal Worker (Python)**: Implements single-agent `AgentWorkflow`. Runs the durable ReAct loop: context hydration → LLM reasoning → skill dispatch → observation → loop.
- **Skill Dispatcher (Go)**: Parses slash-command invocations, validates arguments against skill schemas, fires the Hook Engine for pre/post hooks, and routes tool chains to the Tool Router.
- **Hook Engine (Go)**: Executes declarative YAML-configured hooks at pre/post-skill boundaries for audit logging, cost metering, and HITL interception.
- **Lifecycle Manager (Go)**: Enforces state machines across all four tiers (Draft → Staged → Active ↔ Paused → Archived). Manages canary deployment traffic splitting via Argo Rollouts. Emits immutable lifecycle events to the Lifecycle State Store.
- **Cost Attribution Service (Go)**: Consumes OTel spans from a Kafka topic. Aggregates token counts, sandbox execution time, and Vector DB ops by (tenant, agent, skill). Enforces quota limits in real time.
- **Context Hydrator**: Loads tenant-partitioned vector memories and injects Skill SOPs into the agent's system prompt before each LLM call.
- **Sandbox Manager**: Provisions ephemeral Docker containers for arbitrary code execution and destroys them immediately post-execution.

## 4. Execution Sequences

### 4.1 Single-Agent HITL Flow

```mermaid
sequenceDiagram
    participant Client as Client
    participant Gateway as API Gateway
    participant Validator as Webhook Validator
    participant Temp as Temporal Cluster
    participant Worker as Agent Worker
    participant LLM as External LLM
    participant Auth as HITL Auth
    participant Tool as Target System

    Client->>Gateway: POST /api/v1/agents/{id}/trigger (X-Signature, Idempotency-Key)
    Gateway->>Validator: verifyHMAC + deduplicateIdempotency
    Validator-->>Gateway: valid
    Gateway->>Temp: StartAgentWorkflow
    Temp->>Worker: Dispatch Activity
    Worker->>LLM: Prompt and Context
    LLM-->>Worker: Response Execute Skill
    Worker->>Auth: Check Permissions
    Auth-->>Worker: Status Requires Human Approval
    Worker->>Temp: Pause Workflow Wait for Signal
    Temp-->>Client: Status AWAITING_HITL

    Client->>Temp: Send Signal Approved (mfa_token)
    Temp->>Worker: Resume Workflow
    Worker->>Tool: Execute Tool
    Tool-->>Worker: Success
    Worker->>LLM: Skill Result Success
    LLM-->>Worker: Final Output Generated
    Worker->>Temp: Complete Workflow
    Temp-->>Client: Return Result
```

### 4.2 Agent Team Execution Flow

```mermaid
sequenceDiagram
    participant Client as Client / Webhook
    participant Gateway as API Gateway
    participant Validator as Webhook Validator
    participant Temp as Temporal Cluster
    participant Orch as Team Orchestrator
    participant DispA as Sub-Agent Worker A (DB Triage)
    participant DispB as Sub-Agent Worker B (K8s Inspector)
    participant LLM as External LLM
    participant HITL as HITL Auth
    participant Tool as Target System

    Client->>Gateway: POST /api/v1/teams/{id}/trigger (X-Signature, Idempotency-Key)
    Gateway->>Validator: verifyHMAC + deduplicateIdempotency
    Validator-->>Gateway: valid
    Gateway->>Temp: StartTeamWorkflow(team_manifest, payload)
    Temp->>Orch: Dispatch TeamWorkflow

    Orch->>LLM: Decompose goal into sub-tasks
    LLM-->>Orch: [sub-task-A: query DB, sub-task-B: inspect K8s]

    par Parallel Fan-Out
        Orch->>DispA: StartAgentWorkflow(DB-Triage, sub-task-A)
    and
        Orch->>DispB: StartAgentWorkflow(K8s-Inspector, sub-task-B)
    end

    DispA->>LLM: ReAct loop - query slow logs
    LLM-->>DispA: finding: slow_query on prod-rds-01
    DispA-->>Orch: Result{slow_query}

    DispB->>LLM: ReAct loop - check pod events
    DispB->>HITL: Tool restart_k8s_pod is mutating — suspend
    HITL-->>Orch: TeamHITL triggered by Worker B

    Orch->>Temp: PauseTeamWorkflow (all branches suspend)
    Temp-->>Client: Status AWAITING_HITL

    Client->>Temp: Signal Approved (mfa_token)
    Temp->>DispB: Resume
    DispB->>Tool: execute restart_k8s_pod
    Tool-->>DispB: Success
    DispB-->>Orch: Result{oom_resolved}

    Orch->>LLM: Synthesize [slow_query + oom_resolved]
    LLM-->>Orch: Final incident report
    Orch->>Temp: CompleteTeamWorkflow(report)
    Temp-->>Client: Return Result
```

### 4.3 Tool Registration and Skill Publication

```mermaid
sequenceDiagram
    participant Eng as Platform Engineer
    participant PR as GitHub PR
    participant Bot as Security Scanner
    participant Admin as Security Team
    participant Registry as Tool Registry
    participant Dev as Skill Developer
    participant Studio as Agent Studio
    participant Catalog as Skill Catalog
    participant DB as PostgreSQL

    Eng->>PR: Submit tool spec (JSON schema, auth_level, sandbox_req)
    Bot->>PR: Automated threat surface scan (prompt injection, lateral movement)
    Admin->>Registry: POST /tools (approve)
    Registry->>DB: INSERT tool@v1.0.0 status=approved

    Dev->>Studio: Open Skill Builder
    Studio->>Registry: GET /tools?status=approved
    Registry-->>Studio: approved tools list
    Dev->>Studio: Compose tool + SOP, set RBAC flags (mutating: true)
    Studio->>Catalog: POST /skills {name, version: 1.0.0, tools, sop, rbac}
    Catalog->>DB: INSERT skill@v1.0.0 status=active
    Catalog-->>Studio: 201 Created
    Note over Studio: Skill immediately visible in catalog for No-Code users
```

## 5. Deployment Topology
- **High Availability**: All pods spread across multiple Availability Zones via EKS topology spread constraints. All stateful services (RDS, ElastiCache) run Multi-AZ. Route53 health checks flip traffic to a standby region if the primary ALB is unhealthy for 5+ consecutive minutes.
- **Scaling**: Agent Worker and Team Orchestrator Pods each have independent HPAs driven by their respective Temporal task-queue depths. Sub-Agent Registry and Skill Dispatcher Pods scale on CPU/RPS. Cost Attribution Pods scale on Kafka consumer lag.
- **Service Mesh**: Istio sidecar injection enabled on all namespaces. `PeerAuthentication` set to `STRICT` — all pod-to-pod communication requires mTLS. `cert-manager` rotates mTLS certificates every 30 days automatically.
- **Deployment Strategy**: Argo Rollouts manages canary (10% → 25% → 100%) and blue-green rollouts for Agent Manifests, Skills, and Sub-Agent contracts. Automated analysis rules check workflow success rate and p99 latency; rollback fires automatically if success rate drops more than 10% over 10 minutes.
- **Observability**: OTel Collector Daemons run on every EKS node. Traces export to Prometheus/Grafana/Jaeger. The Cost Attribution Service consumes OTel spans from a Kafka topic to produce per-tenant, per-skill cost records. Agent Studio queries these stacks for the Operations Dashboard and Execution Trace Visualizer.

## 6. Detailed Tech Stack Choices

- **Frontend (Agent Studio UI)**: Next.js (App Router) for SSR and fast routing. Tailwind CSS for styling. React Flow for the Visual Manifest Builder, Team Canvas, and Execution Trace Visualizer DAG with swimlane support.
- **API Gateway & Routing**: Go (net/http or Gin) for high concurrency and low latency. HMAC-SHA256 webhook validation middleware implemented using Go's `crypto/hmac` stdlib (constant-time comparison).
- **Orchestration**: Temporal workflow engine for durable execution. Go Temporal SDK for the Workflow Initiator; Python Temporal SDK for Agent Workers and Team Orchestrator (to leverage the Python AI ecosystem).
- **AI Agent Framework**: Provider-agnostic reasoning loop. Model selection is configurable per sub-agent (`model` field in sub-agent contract). The platform routes through the LLM Gateway rather than binding to any single SDK. Temporal workflow extensions ensure durability of ReAct loops regardless of provider.
- **LLM Gateway & Inference Proxy**: LiteLLM handling load balancing, token governance, and API schema normalization. Bridges to external endpoints (OpenAI, Anthropic, Bedrock) or locally hosted endpoints (vLLM, Ollama, LMStudio).
- **Service Mesh**: Istio with `cert-manager` for automatic mTLS certificate issuance and 30-day rotation. `PeerAuthentication: STRICT` enforced cluster-wide.
- **Deployment Strategy**: Argo Rollouts for canary and blue-green rollouts with automated metric-based analysis and rollback.
- **State & Persistence**: PostgreSQL (Amazon RDS) with per-tenant schemas, Row-Level Security, pgvector extension, and TimescaleDB extension for cost time-series data. Amazon ElastiCache (Redis) for session cache and idempotency key deduplication.
- **Secret Management**: AWS Secrets Manager with per-secret rotation lambdas. External Secrets Operator (ESO) syncs secrets into Kubernetes with zero-downtime rolling restarts.
- **Sandboxed Execution**: Ephemeral Docker Containers with blocked lateral network movement. Destroyed immediately post-execution.
- **Observability**: OTel collectors on every EKS node reporting to Prometheus/Grafana/Jaeger. Cost Attribution Service consumes OTel spans from Kafka to produce per-tenant/agent/skill cost records in TimescaleDB.

## 7. Project Structure (Monorepo)

```text
agentic-paas/
├── apps/
│   └── agent-studio/              # Next.js frontend (Agent Builder, Skill Builder,
│                                  #   Sub-Agent Registry, Team Builder, Ops Dashboard)
├── services/
│   ├── api-gateway/               # Go — REST/gRPC entry point, HMAC validation, RBAC
│   ├── workflow-initiator/        # Go — Temporal workflow dispatcher (agent + team)
│   ├── agent-workers/             # Python — single-agent Temporal workers (ReAct loop)
│   ├── team-orchestrator/         # Python — team Temporal workers (decompose, fan-out, synthesize)
│   ├── sub-agent-registry/        # Go — sub-agent contract storage and versioning
│   ├── skill-dispatcher/          # Go — slash-command parsing, hook execution, tool routing
│   ├── cost-attribution/          # Go — OTel span consumer, quota enforcement, cost reporting
│   ├── context-hydrator/          # Go/Python — vector DB queries, skill SOP injection
│   ├── sandbox-manager/           # Go — ephemeral Docker container lifecycle
│   └── llm-gateway/               # Go — LiteLLM proxy, per-sub-agent model routing
├── packages/
│   ├── go-shared/                 # Shared Go models (AgentManifest, TeamManifest, SubAgentContract)
│   ├── shared-protos/             # Protocol Buffers / gRPC definitions
│   ├── hook-engine/               # Go — shared pre/post skill hook registration and execution
│   ├── webhook-security/          # Go — shared HMAC validation middleware
│   ├── team-sdk/                  # Python — Team Manifest schema, sub-agent client helpers
│   └── skill-sdk/                 # Internal SDK for defining tool schemas
├── infra/
│   ├── terraform/                 # AWS VPC, RDS (with RLS), EKS, ElastiCache, S3, Secrets Manager
│   │   └── secrets-rotation/      # AWS Secrets Manager rotation lambda configs
│   ├── k8s/
│   │   ├── deployments/           # Kubernetes Deployment / Service manifests
│   │   ├── istio/                 # PeerAuthentication, AuthorizationPolicy, VirtualService
│   │   └── argo-rollouts/         # Canary / blue-green Rollout definitions
│   └── local/                     # docker-compose for local development
└── docs/                          # Architecture and technical specs
```

## 8. Core Service Descriptions

- **API Gateway (Go)**: Edge entry point. Validates HMAC-SHA256 signatures on webhook events, enforces per-tenant quotas, issues scoped short-lived OIDC tokens for agent executions, handles SSO authentication (OIDC/SAML), and routes to the Workflow Initiator.
- **Workflow Initiator (Go)**: Translates platform-level manifest IDs into Temporal workflow requests. Routes single-agent triggers to `AgentWorkflow` and team triggers to `TeamWorkflow`. Handles idempotency: duplicate `session_id` values within 24 hours return the cached workflow response.
- **Agent Workers (Python)**: Single-agent Temporal workers. Listen to per-tenant agent task queues, execute the durable ReAct loop (recall → reason → act → observe → learn), and handle HITL signal suspension.
- **Team Orchestrator (Python)**: Team Temporal workers. Implement `TeamWorkflow`: decompose the goal via LLM, fan out to sub-agents via the Sub-Agent Dispatcher, collect typed results, and synthesize a unified response. Propagates HITL suspension team-wide when any sub-agent triggers a mutating action.
- **Sub-Agent Registry (Go)**: Stateless CRUD service backed by PostgreSQL. Stores versioned sub-agent contracts (persona, `allowed_skills`, `model`, `max_iterations`, typed I/O schema). Serves capability contract lookups to the Team Orchestrator and parent Agent Workers at workflow start.
- **Skill Dispatcher (Go)**: Receives skill invocations (slash-command or structured tool call), validates arguments against skill input schemas, fires pre/post hooks via the Hook Engine, and routes tool chains to the Tool Router. Acts as the governed command interface between reasoning and execution.
- **Cost Attribution Service (Go)**: Consumes OTel spans from a Kafka topic. Aggregates LLM token counts, sandbox execution time, and Vector DB ops by (tenant_id, agent_id, skill_id) into TimescaleDB. Enforces quota limits in real time; returns `429 QuotaExceeded` on hard limit breach.
- **Context Hydrator (Go/Python)**: Queries tenant-partitioned pgvector for semantically relevant long-term memories and injects Skill SOPs into the agent's system prompt before each LLM reasoning step.
- **LLM Gateway (Go / LiteLLM)**: Unified inference proxy. Normalizes API formats across providers. Routes per-sub-agent model selections. Enforces token budget limits. Supports fallback to local Ollama/vLLM endpoints for data-sovereign deployments.
- **Sandbox Manager (Go)**: Provisions ephemeral Docker containers with blocked egress for arbitrary tool code execution. Destroys containers immediately post-execution. Returns structured stdout/stderr payloads to the calling worker.
- **Observability Sink**: OTel Collector Daemons on each EKS node. Export structured traces, logs, and metrics to Prometheus/Grafana/Jaeger. Team execution traces include sub-agent swimlane metadata for DAG rendering in Agent Studio.

## 9. Low-Level Component Design & API Contracts

### 9.1 Database & Persistence Specifications
- **Relational DB (Amazon RDS - PostgreSQL)**: Primary source of truth.
  - Temporal backend state (workflow histories, task queues).
  - Platform configuration (agent manifests, skill definitions, sub-agent contracts, team manifests, RBAC rules).
  - Per-tenant schemas with Row-Level Security: `SET LOCAL app.tenant_id = '...'` on every transaction; RLS policies enforce `tenant_id = current_setting('app.tenant_id')`.
  - TimescaleDB extension for cost attribution time-series (`cost_events` hypertable, partitioned by time).
- **Vector Database (pgvector via RDS)**: Tenant-partitioned embeddings for long-term agent and team memory. Team members can access shared memory partitions or isolated per-agent partitions, configured in the Team Manifest.
- **Cache (Amazon ElastiCache - Redis)**: All keys namespaced by `{tenant_id}:` to prevent cross-tenant cache pollution.
  - Global rate limiting.
  - Short-term conversational memory buffering.
  - Webhook idempotency key deduplication (24h TTL per key).
  - Ephemeral session state lock management.

**Key New Schema Objects:**

```sql
-- Sub-Agent contracts (versioned)
CREATE TABLE sub_agent_contracts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  name          TEXT NOT NULL,
  version       TEXT NOT NULL,  -- semver string
  persona       TEXT,
  allowed_skills JSONB,         -- [{name, version}]
  model         TEXT,
  max_iterations INT DEFAULT 10,
  input_schema  JSONB,
  output_schema JSONB,
  status        TEXT CHECK (status IN ('draft','staged','active','paused','archived')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Immutable lifecycle audit log (all four tiers)
CREATE TABLE lifecycle_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type TEXT NOT NULL,  -- 'tool'|'skill'|'sub_agent'|'agent'|'team'
  resource_id   UUID NOT NULL,
  tenant_id     UUID NOT NULL,
  from_state    TEXT,
  to_state      TEXT NOT NULL,
  actor         TEXT NOT NULL,
  reason        TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Cost attribution (TimescaleDB hypertable)
CREATE TABLE cost_events (
  time          TIMESTAMPTZ NOT NULL,
  tenant_id     UUID,
  agent_id      UUID,
  skill_id      UUID,
  tokens_in     INT,
  tokens_out    INT,
  sandbox_ms    INT,
  vector_ops    INT
);
SELECT create_hypertable('cost_events', 'time');
```

### 9.2 Service Languages & Protocols
Explicitly decoupled communication boundaries:
- **Agent Studio <--> Gateway**: `REST/JSON` over HTTPS. Optimized for standard browser interactions.
- **Gateway <--> Internal Services**: Internal `gRPC` over HTTP/2 using Protobuf schemas. Ensures strict typings, generated client stubs, and multiplexed performance.
- **Workflow Initiator <--> Temporal Workers**: Native `gRPC` via Temporal SDK bridging through the Temporal Cluster.
- **Temporal Workers <--> Internal Microservices**: `gRPC` or `REST` depending on legacy integrations, executed via the Tool Router.
- **Temporal Workers <--> LLM Provider**: `REST/HTTPS` mapping directly to provider APIs exclusively using the standard OpenAI SDK format.

### 9.3 Component Interface Definitions (API Docs)

**1. External REST API (Webhook Trigger — Agent)**
Inbound request from an external observability system triggering a single agent. HMAC and idempotency are required.

```http
POST /api/v1/agents/{agent_id}/trigger
Content-Type: application/json
Authorization: Bearer <OIDC_TOKEN>
X-Signature: sha256=<HMAC_SHA256(request_body, tenant_secret)>
X-Timestamp: 1714000000
Idempotency-Key: <uuid-or-deterministic-hash>

{
  "event_source": "datadog-monitor",
  "payload": {
    "alert_id": "AL-99238",
    "description": "API latency exceeded 5s threshold",
    "metrics": { "latency_ms": 5200, "cluster": "prod-us-west-2" }
  }
}
```

Rejection responses:
- `401 Unauthorized` — missing or invalid `X-Signature`
- `400 ReplayDetected` — `X-Timestamp` older than 300 seconds
- `200 OK` (no new workflow) — duplicate `Idempotency-Key` within 24 hours; body contains cached `workflow_id`

**2. External REST API (Team Trigger)**
Triggering an Agent Team follows the same security contract:

```http
POST /api/v1/teams/{team_id}/trigger
X-Signature: sha256=<HMAC_SHA256(body, tenant_secret)>
X-Timestamp: 1714000000
Idempotency-Key: <uuid>

{ "payload": { "incident_id": "INC-442", "severity": "P1" } }
```

**3. Sub-Agent Registry REST API**

```http
POST   /api/v1/sub-agents                    # Register sub-agent contract
GET    /api/v1/sub-agents/{id}               # Resolve contract by ID
GET    /api/v1/sub-agents?status=active      # List (filter by skill, status, tenant)
PUT    /api/v1/sub-agents/{id}               # Publish new version
POST   /api/v1/sub-agents/{id}/transition    # State machine transition (staged→active, etc.)
```

**4. Team Manifest REST API**

```http
POST   /api/v1/teams                         # Create team manifest
GET    /api/v1/teams/{id}                    # Fetch manifest
GET    /api/v1/teams/{id}/status             # Execution status
POST   /api/v1/teams/{id}/deploy             # Deploy (body: {strategy: canary|blue-green|all-at-once})
```

**5. Internal gRPC Interface (Workflow Initiator)**
Updated Protobuf adding team workflow support alongside the original agent session RPC:

```protobuf
syntax = "proto3";
package platform.workflow.v1;

service WorkflowInitiator {
  rpc StartAgentSession(StartAgentRequest) returns (StartAgentResponse);
  rpc StartTeamSession(StartTeamRequest) returns (StartTeamResponse);
  rpc GetSessionStatus(StatusRequest) returns (StatusResponse);
}

message StartAgentRequest {
  string agent_id  = 1;
  string session_id = 2;              // idempotency key
  string tenant_id = 3;
  map<string, string> context = 4;
}

message StartTeamRequest {
  string team_id   = 1;
  string session_id = 2;              // idempotency key
  string tenant_id = 3;
  map<string, string> context = 4;
}

message StartAgentResponse {
  string workflow_id = 1;
  string run_id      = 2;
  string status      = 3;
}

message StartTeamResponse {
  string workflow_id   = 1;
  string run_id        = 2;
  string status        = 3;
  repeated string sub_workflow_ids = 4;
}
```

### 9.4 Temporal Worker Internal Design (Python)
The Worker is implemented iteratively, wrapping the OpenAI Agents SDK into durable Temporal blocks:
- **Activities (`@activity.defn`)**: Any non-deterministic external calls (e.g., LLM inference, calling the Sandbox Manager, querying PGVector) are wrapped as discrete activities. This ensures the cluster automatically handles timeout retries.
- **Workflow (`@workflow.defn`)**: The core ReAct loop is implemented as a strict, stateful workflow function. It orchestrates the activities and pauses execution natively using Temporal's `workflow.wait_condition` to suspend itself while awaiting off-system Human-In-The-Loop (HITL) approval signals via the Gateway.

## 10. Architectural Solutions for Non-Functional Requirements

### 10.1 Execution Sandboxing (NFR1)
- **Solution**: The Tool Proxy service isolates mutating capabilities by forwarding untrusted logic to ephemeral Docker container infrastructure. All agent tool execution running arbitrary scripts is natively containerized with restricted egress blocking lateral internal network movement.

### 10.2 Immutable Auditability (NFR2)
- **Solution**: OpenTelemetry (OTel) instrumentation across all Go/Python microservices. Every LLM prompt, context injection, and agent tool execution is logged with a trace ID and exported to an immutable data store (e.g., centralized Prometheus/Grafana stack). The Agent Studio UI queries this trace backend to reconstruct visual DAG graphs for post-incident review.

### 10.3 Fault Tolerance & Concurrency (NFR3, NFR4)
- **Solution**: By using **Temporal** as the core orchestrator, the agent ReAct loop executes asynchronously. If an underlying EKS worker node terminates abruptly, Temporal detects the lost heartbeat and restarts the isolated Python execution loop directly from the last successful persisted activity, ensuring massive concurrency and 100% resilience against transient crashes.

### 10.4 Model Agnosticism (NFR5)
- **Solution**: By routing all model requests through an internal centralized **LLM Gateway** (e.g., LiteLLM), the `Agent Workers` only ever implement one standardized API format (like the OpenAI schema). The gateway automatically intercepts the stream and proxies it to Anthropic, Gemini, Azure, or crucially—safely routes sensitive inference requests into isolated local computational nodes running open-source models via **vLLM**, **Ollama**, or **LMStudio**. This inherently completely eradicates vendor lock-in.

### 10.5 Cost & Token Governance (NFR6)
- **Solution**: The **LLM Gateway** functions as a global token choke-point. It intercepts all inbound/outbound tokens and rigorously enforces exact budgets natively. Additionally, hard configurations inside the Agent Manifest govern a "Maximum Tool Execution Count" directly shutting down the Temporal Loop itself to prevent infinite ReAct generation bleed.

### 10.6 Agent Machine Identities (NFR7)
- **Solution**: Standardizing on **OIDC Identity Federation**. Agents do not have statically assigned internal passwords. Before querying internal microservices, the Temporal Worker authenticates itself to an internal STS module, swapping its Agent ID for a short-lived OIDC token (5-minute TTL) containing the agent ID, permitted skill list, and resource constraints. The Tool Router validates token scope before every tool execution; out-of-scope invocations are rejected and logged.

### 10.7 Zero-Trust Networking (NFR8)
- **Solution**: **Istio service mesh** deployed cluster-wide with `PeerAuthentication` set to `STRICT` mode — all pod-to-pod communication requires mTLS; plaintext is rejected. `AuthorizationPolicy` resources enforce call graph constraints (e.g., only `skill-dispatcher` may call `tool-router`; only `team-orchestrator` may call `sub-agent-registry`). `cert-manager` provisions mTLS certificates from an internal CA and rotates them every 30 days via automated `CertificateRequest` renewal. Agent Worker pods have a `NetworkPolicy` allowing egress exclusively to the LLM Gateway and Temporal cluster; all other egress is denied by default.

### 10.8 Webhook Security (NFR9)
- **Solution**: Go middleware in the API Gateway implements constant-time HMAC-SHA256 comparison (`hmac.Equal`) between the computed `HMAC(requestBody, tenantSecret)` and the `X-Signature` header value. Requests with an `X-Timestamp` header older than 300 seconds are rejected with `400 ReplayDetected`. Idempotency keys are stored in Redis with a 24-hour TTL; duplicate keys return the cached `workflow_id` without triggering a new Temporal workflow, ensuring exactly-once agent invocation per external event.

### 10.9 Secret Lifecycle Management (NFR10)
- **Solution**: AWS Secrets Manager rotation lambdas configured per secret type — LLM API keys rotate every 90 days, OIDC signing keys every 30 days, database credentials every 90 days. The External Secrets Operator (ESO) syncs rotated secrets into Kubernetes Secrets and triggers zero-downtime rolling restarts of affected pods. A Kubernetes `CronJob` (hourly) scans OTel span attributes and Temporal execution logs for regex patterns matching known secret formats (API key prefixes, JWT structures). On detection, the service automatically revokes the exposed secret via the AWS API and fires a PagerDuty alert within 5 minutes.

### 10.10 Multi-Tenancy Isolation (NFR11)
- **Solution**: PostgreSQL enforces tenant isolation via separate schemas (`tenant_{id}`) and Row-Level Security policies (`tenant_id = current_setting('app.tenant_id')`). The application layer sets `SET LOCAL app.tenant_id = '...'` on every DB transaction — cross-tenant data access is structurally impossible at the database level. Redis namespaces all keys with `{tenant_id}:` prefixes. Temporal uses per-tenant task queues (`{tenant_id}-agent-queue`, `{tenant_id}-team-queue`) — worker pools are shared for efficiency, but queue isolation prevents cross-tenant workflow scheduling or resource starvation.

### 10.11 SLA & Availability (NFR12)
- **Solution**: Prometheus recording rules compute 5-minute rolling p99 workflow invocation latency and per-tenant success rates. Alertmanager fires PagerDuty when success rate drops below 99.5% sustained for 10 minutes. All stateful services (RDS, ElastiCache) run Multi-AZ; EKS topology spread constraints prevent single-AZ concentration. Route53 health checks automatically flip traffic to a standby region if the primary ALB is unhealthy for 5+ minutes (RTO ≤ 1h). Continuous PostgreSQL WAL archiving to S3 enables point-in-time recovery to within 15 minutes of any failure (RPO ≤ 15 min).

### 10.12 Session & Memory Lifecycle (NFR13)
- **Solution**: A Temporal `SessionCleanup` cron workflow runs hourly. It queries Redis for sessions where `last_activity > idle_timeout`, publishes a `SessionExpired` event that triggers context vector eviction from the session cache. A nightly `MemoryArchival` Temporal workflow queries pgvector for embeddings older than the tenant's configured retention period, exports them to S3 in Parquet format, and deletes from the live table. Session memory budgets are enforced inside Agent Workers before each activity: at 80% utilization the worker purges the oldest context entries from the conversation window; at 100% it raises `OutOfMemoryError` and terminates the Temporal workflow with a structured error payload containing the session ID and last successful step.

## 11. Configuration & Secrets Management

To maintain enterprise security postures and streamline MLOps deployments, configuration and secrets are strictly segregated into three architectural layers:

### 11.1 Infrastructure & Application Config (GitOps)
- **Pattern**: Kubernetes ConfigMaps managed declaratively via GitOps (e.g., ArgoCD or Flux).
- **Usage**: Used for static, service-level configurations that bind the platform topology together. Examples include database connection strings (excluding passwords), Temporal cluster addresses, OpenTelemetry collector endpoints, and environment-specific flags (Dev, Staging, Prod). This ensures infrastructure immutability.

### 11.2 Dynamic Agent & Platform Config (Database / Cache)
- **Pattern**: Polled Relational State (PostgreSQL + Redis).
- **Usage**: Unlike static infrastructure, Agent capabilities (System Prompts, Max Token limits, Attached Skills, Fallback Models) change rapidly. To avoid requiring software redeployments for behavior changes, the Agent Studio UI mutates these configurations directly in Postgres. The API Gateway and Context Hydrator read and locally cache these definitions dynamically at task initiation to instantiate the correct ReAct loop parameters on the fly.

### 11.3 Enterprise Secrets & Vault Management (AWS Native)
- **Pattern**: **AWS Secrets Manager** deeply integrated with Kubernetes via the **External Secrets Operator (ESO)**.
- **Usage**: LLM API keys, OIDC STS signing secrets, and sensitive system credentials are never stored in Git repositories or injected as raw environment variables. ESO syncs secrets into Kubernetes Secrets on a polling interval; secret updates trigger zero-downtime rolling restarts of affected pods automatically.
- **Rotation SLA**: LLM API keys rotate every 90 days; OIDC signing keys rotate every 30 days; database credentials rotate every 90 days. All rotations are automated via per-secret AWS Secrets Manager rotation lambdas.
- **Leak Detection**: A Kubernetes `CronJob` scans OTel spans and Temporal execution logs hourly for regex patterns matching known secret formats. Detected leaks trigger automatic secret revocation via the AWS API and a PagerDuty alert within 5 minutes.
- **Just-In-Time (JIT) Tool Execution**: When the reasoning agent invokes a mutating skill on a sensitive external system, the Sandbox Manager fetches the required credential from AWS Secrets Manager exclusively for the lifespan of that Docker container execution. The credential never touches the agent's memory or state.

## 12. Local Development Architecture (DevEx)

To ensure rapid iteration cycles without incurring unnecessary cloud costs or bottlenecking on strict IAM policies, the architecture is designed to map cleanly onto a developer's local machine (macOS/Linux) via a hybrid configuration.

### 12.1 Local Backing Services (Docker Compose)
Heavy infrastructure state and dependencies should **not** be installed natively. A unified `docker-compose.yml` spins up the essential ecosystem backbone locally:
- **`postgres`**: Customized container running `pgvector` and TimescaleDB extensions. Run `make db-migrate` after first start to apply per-tenant schema and RLS policies for the local `dev` tenant.
- **`redis`**: Session cache, rate limiting, and webhook idempotency key deduplication (all local dev uses a single `dev:` key prefix).
- **`temporal-server` & `temporal-ui`**: Standalone orchestration cluster (available at `localhost:7233` / `localhost:8233`).
- **`sub-agent-registry`**: Go binary container backed by the local Postgres instance.
- **`skill-dispatcher`**: Go binary container. Set `WEBHOOK_HMAC_DISABLED=true` in `.env` to bypass HMAC validation locally.
- **`cost-attribution`**: Go binary container with a mock Kafka consumer (reads from a local file queue for dev purposes).
- **`prometheus` & `grafana`**: Local OTel tracing and metrics UI.

### 12.2 Service Execution & Hot-Reloading
Rather than stuffing complex Go/Python build pipelines heavily inside Docker—where debugger attachments drop and iteration loops slow to a crawl—developers run the actual microservices natively to leverage their IDEs (VS Code/Cursor):
- **Agent Studio (Frontend)**: Runs natively via standard React tooling: `npm run dev` (targeting `localhost:3000`).
- **Golang Gateway & Initiator**: Runs natively using `air` to parse code changes automatically and trigger near-instant hyper-local recompilations.
- **Python Agent Workers**: Runs securely via isolated virtual environments (`venv` or `poetry`) combined with `watchfiles` to automatically recycle the Temporal worker instances the moment custom core Agent prompt changes are detected.

### 12.3 Offline Testing & Mocking Constraints
To iterate offline or avoid executing dangerous tools accidentally during testing:
- **Local LLM Inference**: The LLM Gateway is reconfigured via `.env` to point to a local **Ollama** daemon (e.g., Llama-3 or Mistral on an M-series GPU) instead of public provider APIs.
- **Webhook Security Bypass**: Set `WEBHOOK_HMAC_DISABLED=true` in `.env` to skip HMAC signature validation locally. Never set this in staging or production.
- **Multi-Tenancy Local Mode**: Local dev runs against a single `dev` tenant schema. Cross-tenant isolation tests require running `make tenant-seed` to create additional tenant schemas in the local Postgres container.
- **Team Simulation**: `POST /api/v1/teams/{id}/trigger` works against the local docker-compose Temporal instance. Sub-agents run as separate goroutines within the same worker process — no separate pods required locally.
- **Execution Sandbox Compatibility**: Docker-out-of-Docker socket mounting enables ephemeral sandbox containers to spawn locally on Mac hardware exactly as in production, preventing environment mismatches.
