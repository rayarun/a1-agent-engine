# A1 Agent Engine - Quick Reference Guide

Fast lookup for common tasks, key concepts, and important URLs.

## Access URLs

### Development
```
Admin Console:  http://localhost:3001
Agent Studio:   http://localhost:3000
API Gateway:    http://localhost:8080
Admin API:      http://localhost:8089
```

### Production
```
Admin Console:  https://admin.a1-agent-engine.example.com
Agent Studio:   https://agents.a1-agent-engine.example.com
API Gateway:    https://api.a1-agent-engine.example.com
```

---

## Quick Start Checklist

### For Platform Operators
- [ ] Log into Admin Console (localhost:3001)
- [ ] Check Platform Dashboard for service health
- [ ] Configure LLM provider (Mock/Anthropic/OpenAI)
- [ ] Review System Agents and System Tools
- [ ] Monitor Audit Log for system events
- [ ] Check MCP Servers for external integrations

### For Domain Architects
- [ ] Log into Agent Studio (localhost:3000)
- [ ] Browse available Cookbooks
- [ ] Create a new Agent
- [ ] Compose agent from Skills
- [ ] Test agent in Chat interface
- [ ] Review execution Logs
- [ ] Configure Approvals for sensitive operations

---

## Key Concepts at a Glance

| Concept | Definition | Role |
|---------|-----------|------|
| **Agent** | Autonomous entity that reasons and executes tasks | Domain Architect |
| **Skill** | Reusable agent capability composed from tools | Admin/Architect |
| **Tool** | Atomic function (bash, API call, KG search) | Platform Operator |
| **Knowledge Graph** | Domain ontology storing entities and relationships | Both |
| **Cookbook** | Domain template with pre-built agents and KGs | Domain Architect |
| **Tenant** | Isolated multi-tenant workspace | Platform Operator |
| **Approval** | HITL authorization for sensitive operations | Both |

---

## Admin Console Navigation

### Dashboard
```
Click: Dashboard (left sidebar)
View: Platform metrics, active workflows, service health
Action: Monitor real-time activity
```

### LLM Configuration
```
Click: LLM Config (left sidebar)
View: Available LLM providers and models
Action: Configure platform LLM and per-model access
```

### System Management
```
Click: System Agents / System Tools / System Skills
View: Pre-built platform components
Action: Enable/disable, configure, monitor usage
```

### Knowledge Management
```
Click: Knowledge Graphs
View: Available domain ontologies
Action: Browse, search, validate schemas
```

### Cookbook Management
```
Click: Cookbooks
View: Domain templates
Action: Review variables, artifacts, and MCP recommendations
```

### Integration Management
```
Click: MCP Servers
View: Registered MCP servers and tokens
Action: Register servers, issue tokens, manage integrations
```

### Monitoring & Audit
```
Click: Audit Log / Cost Tracking
View: System events, usage metrics, billing
Action: Search logs, analyze costs, compliance reporting
```

---

## Agent Studio Navigation

### Agent Management
```
Click: Agents (left sidebar)
View: Available agents
Action: Create, edit, test agents
```

### Agent Testing
```
Click: Chat
View: Chat interface
Action: Send messages, monitor tool calls, review responses
```

### Knowledge Exploration
```
Click: Knowledge Graphs
View: Interactive KG visualization
Action: Filter nodes, explore relationships, validate schema
```

### Cookbook Usage
```
Click: Cookbooks
View: Available templates
Action: Review, import, customize for your domain
```

### Operation Monitoring
```
Click: Logs / Approvals
View: Execution traces and pending approvals
Action: Debug failures, authorize operations
```

---

## Common Commands

### Deploy an Agent
```
1. Agent Studio → Agents → "+ New Agent"
2. Enter name and description
3. Select model (Claude 3.5 Sonnet)
4. Add skills from catalog
5. Set max iterations (5-10 recommended)
6. Save and test in Chat
```

### Import a Cookbook
```
1. Agent Studio → Cookbooks
2. Find template (e.g., DevOps-SRE)
3. Click "Import Cookbook"
4. Fill in variables (org_name, env_names, alert_channel)
5. Confirm resources to create
6. Verify agents and KGs deployed
```

### Configure LLM
```
1. Admin Console → LLM Config
2. Select Platform LLM Mode
3. Configure model-specific access
4. Set per-tenant overrides if needed
5. Click "Save Configuration"
```

### Register MCP Server
```
1. Admin Console → MCP Servers
2. Click "+ Register Server"
3. Enter server details (URL, auth)
4. Click "Register"
5. Monitor server health
```

### Approve Agent Operation
```
1. Agent Studio → Approvals
2. Review pending request
3. Read agent reasoning and context
4. Click "Approve" or "Reject"
5. Add notes for audit trail
```

---

## Troubleshooting Quick Tips

### Agent doesn't execute
```
✓ Check: Agent has required skills
✓ Check: Skills use enabled tools
✓ Check: LLM is configured and available
✓ Check: Agent max_iterations not too low
→ Review: Logs tab for execution traces
```

### Tool not found error
```
✓ Check: Tool is in System Tools
✓ Check: Tool is enabled for tenant
✓ Check: Skill uses correct tool name
✓ Check: Tool doesn't require approval (check HITL)
→ Review: Admin Console → System Tools
```

### Knowledge graph search empty
```
✓ Check: KG is imported to tenant
✓ Check: Nodes have embeddings
✓ Check: Search terms match schema
✓ Check: KG has data (not empty)
→ Review: KG visualization for content
```

### Approval workflow stuck
```
✓ Check: Approval is not auto-approved
✓ Check: Approver has permissions
✓ Check: No infinite approval loops
✓ Check: Approval timeout not exceeded
→ Review: Audit Log for approval events
```

### Performance degradation
```
✓ Check: Service health (Dashboard)
✓ Check: Workflow quotas not exceeded
✓ Check: Token budget not exhausted
✓ Check: LLM provider responding
→ Review: Cost Tracking and metrics
```

---

## Important Settings

### Agent Configuration
```
model:              Claude 3.5 Sonnet (recommended)
max_iterations:     5-10 (prevent runaway)
approval_required:  true (for mutating operations)
tools_access:       "least privilege" (only needed tools)
```

### Skill Configuration
```
mutating:           false (for read-only skills)
approval_required:  true (for state-changing skills)
version:            explicit (avoid "latest")
tenant_scope:       explicit (not global unless needed)
```

### LLM Configuration
```
platform_mode:      Anthropic (production)
fallback_model:     Claude 3 Opus
per_tenant_override: false (unless needed)
token_limit:        100K/day (default quota)
```

### Knowledge Graph Configuration
```
auto_embedding:     true (for semantic search)
schema_validation:  strict (enforce types)
version_tracking:   enabled (audit trail)
retention:          indefinite (historical value)
```

---

## Important URLs & Resources

### Documentation
- **[PLATFORM_GUIDE.md](./PLATFORM_GUIDE.md)** — Complete platform guide with screenshots
- **[SCREENSHOTS_INDEX.md](./SCREENSHOTS_INDEX.md)** — Visual walkthrough and reference
- **[README.md](./README.md)** — Project overview and setup
- **[architecture.md](./architecture.md)** — System design and data flow

### External Resources
- [Temporal Documentation](https://docs.temporal.io) — Workflow orchestration
- [Anthropic API Docs](https://docs.anthropic.com) — Claude API reference
- [OpenAI API Docs](https://platform.openai.com/docs) — GPT models

### Monitoring & Debugging
- **Logs:** Agent Studio → Logs (execution traces)
- **Approvals:** Agent Studio → Approvals (pending authorizations)
- **Audit:** Admin Console → Audit Log (system events)
- **Health:** Admin Console → Dashboard (service status)

---

## Pro Tips

### Performance
- Use semantic search for large knowledge graphs (kg-semantic-search)
- Batch tool calls where possible
- Set reasonable max_iterations limits
- Monitor token usage and optimize prompts

### Security
- Require approval for all mutating operations
- Rotate MCP tokens regularly
- Review audit logs frequently
- Enforce tenant isolation

### Usability
- Name agents descriptively (include domain)
- Document all custom skills
- Keep knowledge graphs updated
- Use cookbooks as templates

### Reliability
- Test agents thoroughly before deployment
- Enable error handling in skills
- Monitor execution logs
- Set up alerts for failures

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + K` | Quick search/command palette (if available) |
| `Ctrl/Cmd + /` | Help/documentation (if available) |
| `ESC` | Close modals/dialogs |
| `Tab` | Navigate form fields |
| `Enter` | Submit forms |

---

## Status Indicators

### Agent Status
- 🟢 **active** — Ready for use
- 🟡 **suspended** — Temporarily disabled
- ⚫ **archived** — Legacy, not recommended
- 🔴 **deprecated** — Do not use

### Service Health
- 🟢 **Healthy** — All systems operational
- 🟡 **Degraded** — Partial functionality
- 🔴 **Down** — Service unavailable

### Workflow Status
- ⏳ **Running** — In progress
- ✅ **Completed** — Successfully finished
- ⚠️ **Paused** — Awaiting approval
- ❌ **Failed** — Execution error

### Approval Status
- 🔄 **Pending** — Awaiting human decision
- ✅ **Approved** — Authorized to proceed
- ❌ **Rejected** — Operation blocked
- ⏱️ **Expired** — Request timeout

---

## Contact & Support

### For Questions
- Check [PLATFORM_GUIDE.md](./PLATFORM_GUIDE.md) for detailed documentation
- Review [SCREENSHOTS_INDEX.md](./SCREENSHOTS_INDEX.md) for visual reference
- Search [architecture.md](./architecture.md) for system design questions

### For Issues
- Check Logs tab for execution traces
- Review Audit Log for system events
- Monitor Dashboard for service health
- File GitHub issue with logs and context

### For Feedback
- Report issues on GitHub
- Suggest improvements via email
- Share feedback through internal channels

---

**Last Updated:** May 15, 2026

**Version:** 1.0.0

Bookmark this page for quick reference!
