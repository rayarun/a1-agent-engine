# Enterprise Agentic PaaS: Requirement Specification

This document outlines the core functional and non-functional requirements for building an enterprise-grade Agentic Platform, prioritizing resilience, observability, and a no-code developer experience.

## 1. Platform Vision and Goals

### Platform Vision

To provide a secure, highly-scalable, and developer-friendly Platform-as-a-Service (PaaS) that democratizes the creation of resilient, stateful AI agents across the enterprise. By abstracting away the complex "plumbing" of LLM orchestration, state management, and security guardrails, the platform empowers product teams, SREs, and domain experts to deploy autonomous solutions — interactive, event-driven, and schedule-triggered — using a simple "No-Code" manifest approach. Workflows may compose deterministic rule-based steps, autonomous agent reasoning, and Human-in-the-Loop approval gates within a single durable execution, enabling enterprise-grade process automation without sacrificing auditability or human accountability.

### Strategic Goals

1. **Democratize Agent Creation:** Reduce the time-to-market for new AI use cases (from Internal SRE to Customer-Facing Advisors) from weeks to hours by providing generic, reusable abstractions and an Agent Studio visual builder.

2. **Enterprise-Grade Resilience:** Guarantee zero-data-loss execution for long-running agent tasks. Utilize durable ReAct loops that survive pod crashes, API limits, and transient failures, ensuring agents resume exactly where they left off.

3. **Strict Security & Compliance:** Ensure every AI action is strictly authenticated, authorized, and executed in isolated sandboxes. Maintain a 100% immutable, auditable trail of LLM reasoning and tool executions for regulatory compliance.

4. **Future-Proof Extensibility:** Maintain a provider-agnostic architecture that prevents vendor lock-in. The platform must allow seamless swapping of foundational LLMs, dynamic discovery of internal tools via standard protocols (e.g., MCP), and pluggable memory stores.

5. **Hybrid & Scheduled Automation:** Enable workflows that compose deterministic rule execution, autonomous agent reasoning, and Human-in-the-Loop approval gates within a single durable workflow. Support cron-based and fixed-interval scheduled triggers alongside webhook and chat-based invocations, allowing enterprise processes to run autonomously on a defined cadence without requiring human initiation.

## 2. Core User Journeys

To contextualize the platform's requirements, the following journeys illustrate how different personas interact with the Agentic PaaS.

### Journey 1: The "No-Code" Agent Creation (Persona: Domain Expert / Product Manager)

* **Step 1:** A Domain Expert logs into **Agent Studio** using Enterprise SSO.

* **Step 2:** They create a new agent, defining its "System Prompt" (e.g., "You are an L1 Database Support Agent").

* **Step 3:** Using a visual dropdown, they attach pre-approved **Skills** from the **Skill Catalog** (e.g., `Database Triage Skill`). Under the hood, this skill safely bundles primitive tools (`query_slow_logs`, `check_db_cpu`) with InfoSec-approved Standard Operating Procedures (SOPs).

* **Step 4:** They open the **Agent Simulator** in the Studio to chat with the drafted agent. They watch the execution trace graph in real-time to ensure it utilizes its skills correctly.

* **Step 5:** Satisfied, they click "Deploy." The platform automatically generates the YAML manifest and provisions the necessary routing endpoints and Temporal workers.

### Journey 2: Resilient Task Execution (Persona: End User & System)

* **Step 1:** An End User asks the deployed agent to "Analyze yesterday's traffic spike and correlate it with any code deployments."

* **Step 2:** The Agent enters its **Durable Execution Loop** (ReAct). It successfully utilizes a `Metrics Analysis Skill` and then begins executing a `GitHub Audit Skill`.

* **Step 3:** *System Failure:* The EKS node running the Temporal Worker suddenly crashes due to underlying hardware failure.

* **Step 4:** *Recovery:* A new worker spins up on a healthy node. Thanks to Temporal, it does not restart the task or re-query the metrics. It seamlessly resumes the exact step where it failed.

* **Step 5:** The Agent finishes the analysis and returns the final correlated report to the user.

### Journey 3: Human-In-The-Loop Approval (Persona: Senior Engineer / Approver)

* **Step 1:** An automated monitoring agent detects a memory leak and decides the best course of action is to restart the affected pods.

* **Step 2:** It invokes its `Kubernetes Remediation Skill`, which attempts to call the primitive `restart_k8s_pod` tool.

* **Step 3:** The platform's RBAC engine intercepts this, noting the underlying tool is marked as "mutating" and requires human approval. The workflow enters a suspended state.

* **Step 4:** An alert is sent to a dedicated Slack channel with a link to the Agent Studio.

* **Step 5:** A Senior Engineer clicks the link, views the **Execution Trace Visualizer** (an interactive DAG showing exactly which logs the agent read and why it decided a restart was necessary), and clicks "Approve."

* **Step 6:** The workflow wakes up, executes the sandbox tool, and resolves the incident.

### Journey 4: Event-Driven Agent Triggering (Persona: Automated System)

* **Step 1:** An external observability tool (e.g., Datadog, PagerDuty) detects a sudden spike in 5xx errors and fires a webhook.

* **Step 2:** The Agentic PaaS API Gateway receives the webhook and maps the payload to the specific "L1 Triage Agent" manifest.

* **Step 3:** The Temporal Workflow Engine spins up the agent asynchronously, passing the alert payload as the initial context prompt.

* **Step 4:** The agent autonomously uses its skills to pull recent logs and check Kubernetes events.

* **Step 5:** Without any human initiation, the agent compiles a summary, updates the PagerDuty ticket, and posts its root-cause hypothesis to the SRE Slack channel.

### Journey 5: Hybrid Workflow — AWS Billing Anomaly Response (Persona: FinOps Engineer)

This journey demonstrates a single durable workflow that moves through three execution modes — deterministic filtering, agentic investigation, and human approval — before executing a safe, auditable action. No single mode could handle the full process: the filter is too cheap to waste LLM tokens on, the investigation is too ambiguous for static rules, and the infrastructure change is too risky to execute without a human checkpoint.

* **Step 1 (Non-Agentic — Rule Evaluation):** AWS Cost Anomaly Detection fires a webhook reporting an unexpected $3,200 spike in EC2 costs over 48 hours. The Platform Gateway validates the HMAC signature, deduplicates via idempotency key, and starts the `aws-cost-anomaly-workflow`. A deterministic activity evaluates the anomaly severity: below $500 → log and close; $500–$5,000 → proceed to investigation; above $5,000 → escalate immediately to FinOps lead. This routing decision uses no LLM.

* **Step 2 (Non-Agentic — Data Extraction):** Three tool calls execute sequentially with no LLM involvement: `aws_ce_get_cost_and_usage` fetches a service-level cost breakdown for the past 7 days; `aws_cloudwatch_get_metrics` retrieves CPU and memory utilization for the highest-cost EC2 instances; `internal_tagging_db_lookup` resolves ownership (team, cost center, environment) for each flagged resource. Output is a structured data package passed to the agentic phase.

* **Step 3 (Agentic — Investigation):** The `AWS Cost Investigation Agent` enters its ReAct loop with the extracted data as context. It cross-references Compute Optimizer right-sizing recommendations, identifies that two `m5.2xlarge` instances in the `prod-data-pipeline` namespace have sustained under 8% CPU utilization for six weeks, and checks CloudWatch p99 spikes to confirm they are genuinely over-provisioned rather than bursty. After three reasoning steps the agent produces a structured recommendation: downsize both instances to `m5.large`, projected annual saving $2,400.

* **Step 4 (HITL — Mutating Gate):** The agent invokes `ec2_modify_instance_type`, which is flagged `mutating: true`. The workflow suspends via `workflow.wait_condition`. An alert is posted to the `#finops-approvals` Slack channel with a deep link to the Agent Studio **Execution Trace Visualizer**, where the FinOps team lead can inspect the full reasoning chain — CloudWatch utilization graphs, Compute Optimizer evidence, and projected saving — before deciding. The team lead clicks **Approve (MFA)** in the UI.

* **Step 5 (Non-Agentic — Deterministic Execution):** A deterministic skill chain executes: snapshot both instances, stop, modify instance type, start, wait for CloudWatch health check to pass (5-minute window), update the internal CMDB, and create a Jira change ticket. No LLM is on the execution path. If the health check fails, a compensating transaction automatically reverts the instance type and pages the approver.

* **Step 6 (Non-Agentic — Audit):** A structured savings record is written to the Cost Attribution Store. The full execution trace is archived to S3. The anomaly incident is marked resolved.

### Journey 6: Scheduled Workflow — Weekly AWS Cost Optimization (Persona: FinOps Automation)

This journey demonstrates a fully autonomous, schedule-triggered workflow with no interactive user session. Because no user initiates the workflow, HITL approvals are delivered asynchronously via Slack and email rather than blocking an interactive session.

* **Step 1 (Scheduled Trigger — Configuration):** A FinOps engineer configures this once in **Agent Studio → Schedule Builder**: selects the `aws-cost-optimization-team` as the target, enters cron expression `0 18 * * 5` (every Friday at 18:00 IST), sets timezone to `Asia/Kolkata`, configures blackout windows to exclude NSE market hours (09:15–15:30 weekdays) and public holidays, sets overlap policy to `SKIP` (so a running analysis is never duplicated), and adds `#finops-weekly` Slack channel and `finops-lead@company.com` as async HITL notification targets.

* **Step 2 (Scheduled Trigger — Execution):** Every Friday at 18:00 IST, the Temporal Schedule Engine fires automatically. The Schedule Service renders the payload template — substituting `{{.LastSuccessfulRunTime}}` and `{{.ScheduledTime}}` to produce the correct 7-day analysis window — and calls the Workflow Initiator with `trigger_source: scheduled`.

* **Step 3 (Non-Agentic — Batch Extraction):** The workflow begins with deterministic data collection. Three tool calls execute with no LLM: `aws_ce_get_cost_and_usage` (7-day window, grouped by service, account, and resource tag), `aws_compute_optimizer_fetch` (EC2, Lambda, ECS recommendations), and `aws_trusted_advisor_fetch` (low-utilization and idle resource findings). Temporal retries each activity independently on failure before the agentic phase begins.

* **Step 4 (Agentic — Team Analysis, Parallel):** The Team Orchestrator fans out to three sub-agents running in parallel:
  - **Waste Analyst** identifies genuinely idle EC2 instances, cross-referencing deployment dates and CloudWatch p99 spikes to distinguish idle resources from low-but-critical ones.
  - **Right-Sizing Analyst** evaluates Compute Optimizer recommendations against real utilization patterns, checking for x86-only workload constraints and existing RI coverage that would be voided by instance type changes.
  - **Commitment Analyst** identifies workloads with stable utilization above 80% that lack Savings Plan coverage, and flags RI commitments expiring within 60 days.

* **Step 5 (Agentic — Synthesis):** The Team Orchestrator synthesizes all three outputs: deduplicates overlapping recommendations, groups actions by resource-owning team (from tagging DB), and buckets them into three tiers — auto-approve (low risk, reversible, e.g. deleting unattached EBS snapshots), team-lead approval (medium risk, e.g. right-sizing EC2), and dual sign-off (financial commitments, e.g. RI/Savings Plan purchases).

* **Step 6 (Async HITL — No Interactive Session):** The workflow suspends for Tier 2 and Tier 3 actions. Because `trigger_source` is `scheduled`, async HITL mode activates automatically. Slack messages are dispatched to each resource-owning team lead with a direct link to the Agent Studio Execution Trace showing the recommendation and the sub-agent's reasoning. Tier 3 actions route to both the FinOps lead and VP Engineering for dual approval. Approvers have 72 hours; expired approvals are logged as `deferred` in `schedule_run_history` and carried to the next cycle.

* **Step 7 (Non-Agentic — Execution):** Each approved action triggers a deterministic skill chain: EC2 snapshots, instance type changes with post-change health verification, or Savings Plan purchase API calls. Compensating rollback fires automatically on health check failure.

* **Step 8 (Non-Agentic — Reporting):** A weekly savings report is published to the FinOps Confluence space. `schedule_run_history` is updated with the run outcome and total savings realized. The Vector DB is updated with this cycle's recommendation outcomes (accepted, rejected, snoozed by team) so sub-agents have richer context on team-level preferences in future runs.

## 3. Functional Requirements (FR)

These requirements define the core capabilities of the platform, prioritized for an MVP to Production roadmap.

| **ID** | **Priority** | **Requirement** | **Description** |
| ----- | ----- | ----- | ----- |
| **FR1** | **P0** | **Agent Studio & Manifest Builder** | Provide an Agent Studio where users can visually construct agent manifests (persona, skills, memory constraints) and export them as YAML/JSON. |
| **FR2** | **P0** | **Durable Execution Loop** | Agents must execute within a resilient loop. If a system failure occurs during a multi-step task, the agent must resume exactly at the last successful step without losing state. |
| **FR3** | **P0** | **Dynamic Tool Registry** | Support for the Model Context Protocol (MCP) or an internal registry allowing backend Go microservices to expose raw endpoints as primitive tools. |
| **FR4** | **P0** | **Skill Catalog** | Provide an abstraction layer where Senior Engineers can combine primitive Tools with specific prompts/Standard Operating Procedures (SOPs) to create reusable, governed "Skills" for No-Code users. |
| **FR5** | **P1** | **Agent Simulator & Testing** | The Agent Studio must include a "Sandbox Simulator" allowing creators to chat with the drafted agent, visualize its reasoning/skill usage in real-time, and validate behavior before deployment. |
| **FR6** | **P1** | **Human-in-the-Loop (HITL)** | Mutating tools or sensitive skills (e.g., executing a trade, scaling a cluster) must pause the agent workflow and trigger an asynchronous approval request. |
| **FR7** | **P1** | **Universal Memory Access** | The platform must automatically manage short-term context windows and seamlessly retrieve/store long-term facts from a Vector DB. |
| **FR8** | **P1** | **Event-Driven Triggers** | The platform must expose webhook endpoints or event bus consumers (e.g., Kafka) allowing external systems to autonomously trigger specific agents. |
| **FR9** | **P2** | **Native Multi-Agent Handoffs** | Agents must be able to autonomously transfer conversation context to specialized sub-agents based on the detected intent, configurable via the Agent Studio. |
| **FR10** | **P1** | **Execution Trace Visualizer** | Provide an interactive Directed Acyclic Graph (DAG) UI within the Agent Studio to visualize the agent's reasoning steps, skill usage, and Temporal execution history for debugging and HITL context. |
| **FR11** | **P0** | **Enterprise SSO Integration** | The Agent Studio must support Single Sign-On (SSO) via SAML 2.0 or OIDC (e.g., Okta, Entra ID) for secure, centralized user authentication. |
| **FR12** | **P0** | **Granular RBAC & Personas** | The platform must enforce strict Role-Based Access Control within Agent Studio, distinguishing between Platform Admins, Skill Developers (can write code/SOPs), Agent Creators (No-code UI users), and HITL Approvers. |
| **FR13** | **P1** | **Hybrid Workflow Execution** | The platform must support workflows that compose deterministic (non-agentic) steps, agentic ReAct reasoning, and HITL approval gates within a single durable Temporal workflow. Each step's execution mode (`deterministic`, `agentic`, `hitl`) must be declared in the manifest and visible as colour-coded badges in the Execution Trace Visualizer. |
| **FR14** | **P1** | **Deterministic Skill Chains** | The platform must allow skills to be invoked directly as deterministic tool chains without LLM reasoning via the Skill Dispatcher. This enables non-agentic pipeline steps — ETL extraction, rule-based evaluations, API call sequences, compensating rollback chains — to participate in hybrid workflows sharing the same durable execution context and audit trail as agentic steps. |
| **FR15** | **P1** | **Scheduled Workflow Triggers** | The platform must support cron-based and fixed-interval scheduled triggers as a first-class invocation mode alongside webhooks and chat. Schedules must be configurable with timezone, blackout windows (specific dates and day-of-week time ranges), overlap policy (SKIP, BUFFER_ONE, CANCEL_OTHER), payload templating with time variables, and catchup window behavior on platform restart. |
| **FR16** | **P1** | **Schedule Management UI** | Agent Studio must provide a Schedule Builder tab for creating, editing, pausing, and monitoring schedules. The UI must display the next five scheduled run times (computed live from the cron expression), a run history table with per-run status and workflow trace links, and a manual trigger button to fire outside the schedule. |
| **FR17** | **P1** | **Asynchronous HITL Notification** | Scheduled and event-driven workflows with no interactive user session must support async HITL mode: when a mutating action requires approval, the workflow suspends and proactively notifies configured targets (Slack channel, email) within 60 seconds, with a deep link to the Execution Trace Visualizer. Pending approvals persist across platform restarts. Approvals must expire after a configurable TTL (default 72 hours), transitioning the workflow to a defined terminal state rather than hanging indefinitely. |

## 4. Non-Functional Requirements (NFR)

These requirements dictate the operational, security, and resiliency standards (The "SRE" Layer).

| **ID** | **Priority** | **Requirement** | **Description** |
| ----- | ----- | ----- | ----- |
| **NFR1** | **P0** | **Execution Sandboxing** | Tool execution involving arbitrary code or unknown inputs must run in ephemeral, isolated Docker containers preventing network lateral movement while ensuring execution portability. |
| **NFR2** | **P0** | **Immutable Auditability** | Every LLM prompt, skill decision, and state change must be recorded via OpenTelemetry and stored in an immutable ledger for compliance and SRE replay. |
| **NFR3** | **P0** | **Fault Tolerance** | The orchestration layer must survive pod crashes, node terminations, and API rate limits without losing the user's session state. |
| **NFR4** | **P1** | **High Concurrency** | The platform must support thousands of simultaneous agent workflows via asynchronous, non-blocking workers deployed on Kubernetes. |
| **NFR5** | **P1** | **Model Agnosticism** | While optimized for the OpenAI Agents SDK, the underlying LLM provider must be pluggable (e.g., Anthropic, Gemini) to prevent vendor lock-in. |
| **NFR6** | **P2** | **Cost & Token Governance** | Hard limits on token usage per agent session and automatic termination of "infinite ReAct loops" (e.g., max 10 tool iterations). |
| **NFR7** | **P0** | **Agent Machine Identities** | Agents must operate using least-privilege, short-lived non-human identities (e.g., OIDC tokens mapped to the specific Agent Manifest) rather than static, shared API keys to execute tools. |
| **NFR8** | **P1** | **Schedule Reliability** | Scheduled workflows must guarantee exactly-once invocation per scheduled interval using Temporal's native Schedule idempotency guarantees. On platform restart after downtime, missed runs within the configured catchup window must be backfilled; runs beyond the window must be recorded as `skipped` with a structured reason in `schedule_run_history`. Duplicate schedule fires must be suppressed at the Temporal layer. |
| **NFR9** | **P1** | **Async HITL SLA** | For scheduled and event-driven workflows in async HITL mode, approval notifications must be delivered to all configured targets within 60 seconds of workflow suspension. Pending approvals must remain durable across platform restarts, stored in Temporal workflow state. Approvals must expire after a configurable TTL (default 72 hours); the workflow must transition to a defined terminal state (cancelled or deferred-to-next-cycle) rather than hanging indefinitely. |

## 5. UI Mockups / Wireframe Structure

*Note: Visual high-fidelity mockups will be added here once the image generation service has available capacity. Below is the structural layout.*

### 5.1 Agent Studio Builder
A split-pane dashboard used to configure new agents.
- **Left Sidebar**: Navigation (Home, Agents, Skill Catalog, Schedules, Logs, Settings).
- **Top Header**: "Create New Agent" | Action Buttons [Save Draft] [Simulate] [Deploy]
- **Main Content Area**:
  - **Identity**: Input field for `Agent Name` and `Description`.
  - **Persona (System Prompt)**: Large Markdown-supported text area highlighting instructions.
  - **Capabilities**: A drag-and-drop bucket titled "Attached Skills". Clicking "Add Skill" expands a modal with the Skill Catalog.
  - **Limits**: Sliders for `Max Retries`, `Budget/Token Limit`, and `Timeout`.

```text
+-------------------------------------------------------------------------+
| [AgentStudio]              | Create New Agent          [Save] [Deploy]  |
+----------------------------+--------------------------------------------+
| ≡ MENU                     |  Agent Identity                            |
|                            |  [  Name:   SupportBot                   -]|
| ❖ Dashboard                |  [  Desc:   L1 DB Support Agent          -]|
|                            |                                            |
| ◉ Agents            <      |  Persona (System Prompt)                   |
|   - My Agents              |  +---------------------------------------+ |
|   - Templates              |  | You are an autonomous agent capable   | |
|                            |  | of responding to...                   | |
| ⚡ Skills                   |  +---------------------------------------+ |
|                            |                                            |
| 🕐 Schedules                |  Capabilities (Attached Skills)            |
|                            |  +---------------------------------------+ |
| ⚙ Settings                 |  | ≡ K8s Remediation Skill        [X]    | |
|                            |  | ≡ Postgres DB Query Skill      [X]    | |
| 📊 Logs                    |  | + Add New Skill                       | |
|                            |  +---------------------------------------+ |
+----------------------------+--------------------------------------------+
```

### 5.2 Agent Simulator & Chat
A two-column layout for testing the agent before deployment.
- **Left Column (Chat UI)**: Standard chat interface. Messages from the user are blue, agent responses are dark grey.
- **Right Column (Live Telemetry)**: Real-time scrolling console.
  - Shows `[INFO] Attempting to execute skill: K8s Reboot`
  - Expandable JSON blocks showing the exact request and response payloads from internal tools.
  - A small live status indicator: `Agent Status: REASONING...`

```text
+-------------------------------------------------------------------------+
| [AgentStudio]              | Simulator: SupportBot        [End Session] |
+----------------------------+--------------------------------------------+
|        User Chat Mode      |        Live Telemetry & Logs               |
|                            |                                            |
|  [Agent: Hello! I am ready |  > [INFO] Session initialized.             |
|   to assist you.]          |  > [INFO] Loading context vectors...       |
|                            |  > [INFO] Parsing Intent: 'reboot logs'    |
|  [User: can you check the  |                                            |
|   logs and reboot?]        |  > [ACTION] Executing Skill: K8s Reboot    |
|                            |    {                                       |
|  [Agent: Sure, let me      |      "target_tool": "restart_k8s_pod",     |
|   take a look. Hold on.]   |      "payload": {"ns": "default"}          |
|                            |    }                                       |
|  [Agent: I have checked    |                                            |
|   the logs, memory is full.|  > [INFO] Waiting for execution result...  |
|   Rebooting now...]        |  > [SUCCESS] Target tool executed.         |
|                            |                                            |
| -------------------------- | ------------------------------------------ |
| [ Type message...      > ] |  Status: 🟢 REASONING...                   |
+----------------------------+--------------------------------------------+
```

### 5.3 Execution Trace Visualizer
A full-screen analytical dashboard for SREs and Approvers.
- **Header**: Incident # / Workflow ID | Status: `[PAUSED - AWAITING APPROVAL]`
- **Main Canvas**: An interactive Directed Acyclic Graph (DAG) visualizing ReAct steps:
  - Node 1: `Parse Intent` → Node 2: `Fetch Logs` → Node 3: `Analyze Root Cause` → Node 4 (Glowing Orange): `Restart Pod (Requires Approval)`
- **Side Panel**: When an Approver clicks the orange node, a drawer slides out from the right showing:
  - Justification: "Restarting pod X because memory usage exceeded 95%."
  - Action Buttons: `[Approve Execution (MFA)]` | `[Reject & Terminate]`

```text
+-------------------------------------------------------------------------+
| [AgentStudio]              | Exec Trace: Workflow #1A9F  [PAUSED - HITL]|
+----------------------------+--------------------------------------------+
|                                  |                                      |
|    ( 1. Parse Intent )           |  Requires Action                     |
|            |                     |  ----------------------------------- |
|            v                     |                                      |
|    ( 2. Fetch Logs )             |  The agent paused execution because  |
|            |                     |  the target tool is marked as        |
|            v                     |  MUTATING safely.                    |
|    ( 3. Root Cause )             |                                      |
|            |                     |  Target: `restart_pod`               |
|            v                     |  Reason: "Memory usage exceeded 95%" |
|    [ 4. Restart Pod ] <<-- PAUSED|                                      |
|            |                     |  [ APPROVE (MFA) ]                   |
|            v                     |                                      |
|    ( 5. Complete Workflow )      |  [ REJECT & QUIT ]                   |
|                                  |                                      |
+----------------------------+--------------------------------------------+
```

### 5.4 Schedule Builder
A dedicated tab in Agent Studio for managing scheduled workflow triggers.
- **Schedule List**: Table showing all schedules with name, target agent/team, next run time, last run status, and pause/resume toggle.
- **Schedule Editor** (right panel on row select or new):
  - **Target**: Dropdown to select Agent or Agent Team manifest.
  - **Trigger**: Toggle between Cron Expression and Fixed Interval. Cron input shows a "Next 5 runs" preview computed live.
  - **Timezone**: Searchable dropdown (e.g., `Asia/Kolkata`).
  - **Blackout Windows**: Date picker for specific dates; day-of-week + time range toggles.
  - **Overlap Policy**: Radio group (SKIP / BUFFER_ONE / CANCEL_OTHER / ALLOW_ALL) with plain-language descriptions.
  - **Payload Template**: JSON editor with variable autocomplete (`{{.ScheduledTime}}`, `{{.LastSuccessfulRunTime}}`).
  - **Async HITL Targets**: Multi-input for Slack channels and email addresses to notify when the workflow suspends for approval.

```text
+-------------------------------------------------------------------------+
| [AgentStudio]              | Schedules               [+ New Schedule]   |
+----------------------------+--------------------------------------------+
| ≡ MENU                     | Name              | Next Run   | Status    |
|                            +-------------------------------------------+
| ❖ Dashboard                | Weekly AWS Cost   | Fri 18:00  | ● Active  |
|                            | Trade Anomaly Chk | Daily 6am  | ● Active  |
| ◉ Agents                   | EOD KYC Batch     | Weekdays5p | ⏸ Paused  |
|                            |                                            |
| ⚡ Skills                   +-------------------------------------------+
|                            | EDIT: Weekly AWS Cost Optimization         |
| 🕐 Schedules         <      |                                            |
|                            | Target: [Agent Team ▼] [aws-cost-team   ▼] |
| ⚙ Settings                 | Trigger: (●) Cron  ( ) Interval            |
|                            | Cron:   [ 0 18 * * 5          ] [IST ▼]    |
| 📊 Logs                    | Preview: Fri Apr 25 18:00, Fri May 2 18:00 |
|                            |                                            |
|                            | Overlap: (●) SKIP  ( ) BUFFER_ONE          |
|                            |          ( ) CANCEL_OTHER                  |
|                            |                                            |
|                            | HITL Targets (async notify):               |
|                            | [#finops-approvals  ×]  [+ Add Slack]      |
|                            | [finops@company.com ×]  [+ Add Email]      |
|                            |                                            |
|                            |    [Save Schedule]      [Trigger Now]      |
+----------------------------+--------------------------------------------+
```

### 5.5 Hybrid Workflow Execution Trace
An enhanced Execution Trace Visualizer with step-type badges for hybrid workflows. Each node is colour-coded by execution mode — grey for deterministic, blue for agentic, orange for HITL — making the mode boundary visible to approvers and SREs without reading log output.

```text
+-------------------------------------------------------------------------+
| [AgentStudio]       | Exec Trace: aws-cost-anomaly  [PAUSED - HITL]     |
+---------------------+---------------------------------------------------+
| Legend:             |                                                   |
|  ■ DETERMINISTIC    | [1. Webhook Ingest & Rule Eval ] ■ DETERMINISTIC  |
|  ◆ AGENTIC          |              |                                    |
|  ● HITL             |              v                                    |
|                     | [2. AWS Data Extraction       ] ■ DETERMINISTIC  |
|                     |              |                                    |
|                     |              v                                    |
|                     | [3. Cost Investigation Agent  ] ◆ AGENTIC         |
|                     |    ├─ query cost explorer     ✓                   |
|                     |    ├─ fetch cloudwatch metrics✓                   |
|                     |    └─ cross-ref tagging DB    ✓                   |
|                     |              |                                    |
|                     |              v                                    |
|                     | [4. ec2_modify_instance_type  ] ● HITL - PAUSED   |
|                     |                               |                  |
|                     |  Recommendation:              | [ APPROVE MFA ]  |
|                     |  m5.2xlarge → m5.large x2     |                  |
|                     |  Saving: $2,400/yr            | [ REJECT ]       |
|                     |  Confidence: 94%              |                  |
|                     |                               | Notified:        |
|                     |              v                | #finops-approvals|
|                     | [5. EC2 Resize + Health Check ] ■ DETERMINISTIC  |
|                     | [6. CMDB Update + Report      ] ■ DETERMINISTIC  |
|                     |                                                   |
+---------------------+---------------------------------------------------+
```
