# Phase 5 Architecture: Complete Observability

## System Design Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin Console (Frontend)                  │
│  ┌──────────────┬──────────────┬──────────────────────────┐  │
│  │  /cost       │ /executions  │ /executions/[id]         │  │
│  │  (USD costs) │  (list)      │ (timeline + polling)     │  │
│  └──────┬───────┴──────┬───────┴──────────────┬───────────┘  │
│         │              │                      │              │
└─────────┼──────────────┼──────────────────────┼──────────────┘
          │ HTTP REST    │ HTTP REST            │ 1s polling
          │              │                      │
┌─────────▼──────────────▼──────────────────────▼──────────────┐
│              Admin API Gateway (Backend)                      │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Authentication Middleware (Bearer Token)                │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Cost Handlers:                                          │ │
│  │  - getCostSummary() → DB + Pricing Model → cost_usd     │ │
│  │  - getCostByTenant() → DB + Pricing → cost_usd breakdown│ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │  Execution Handlers:                                     │ │
│  │  - listExecutions() → workflow_executions table          │ │
│  │  - getExecution() → DB + Temporal fallback               │ │
│  │  - getExecutionEvents() → Temporal QueryWorkflow()       │ │
│  └──────────────────────────────────────────────────────────┘ │
└─────────┬──────────────┬──────────────────────┬──────────────┘
          │ SQL Query    │ DescribeWorkflow()   │ QueryWorkflow()
          │              │                      │
┌─────────▼──────┐  ┌────▼──────────────────────▼──────────────┐
│  PostgreSQL DB │  │     Temporal Server                      │
│  ┌────────────┐│  │  ┌──────────────────────────────────┐   │
│  │ cost_events││  │  │  AgentWorkflow Executions        │   │
│  │ (tokens)   ││  │  │  - Status tracking               │   │
│  │ platform_  ││  │  │  - Event stream                  │   │
│  │   config   ││  │  │  - QueryWorkflow("get_events")   │   │
│  │ (pricing)  ││  │  └──────────────────────────────────┘   │
│  │ workflow_  ││  │                                          │
│  │  executions││  │                                          │
│  └────────────┘│  │                                          │
└────────────────┘  └──────────────────────────────────────────┘
```

## Key Components

### 1. Temporal Integration

#### Connection & Initialization
```go
// In main.go
temporalClient, err := client.Dial(client.Options{
    HostPort: os.Getenv("TEMPORAL_HOSTPORT") // localhost:7233
})

// AdminHandler receives client
handler := &service.AdminHandler{
    TemporalClient: temporalClient,
}
```

#### Querying Patterns

**Pattern 1: Describe Workflow Execution**
```go
desc, err := h.TemporalClient.DescribeWorkflowExecution(ctx, workflowID, "")
// Returns: Status, StartTime, CloseTime, Metadata
```

**Pattern 2: Query Workflow Events**
```go
val, err := h.TemporalClient.QueryWorkflow(ctx, workflowID, "", "get_events")
// Requires: Workflow implements "get_events" query handler
// Returns: []AgentEvent from workflow state
```

**Pattern 3: Fallback Strategy**
```
1. Try database (workflow_executions) → fast path (~2-5ms)
2. If not found → Try Temporal → slower path (~40ms)
3. If both fail → Return 404
```

### 2. Execution Tracking Architecture

#### workflow_executions Table

**Schema:**
```sql
workflow_id      TEXT PRIMARY KEY          -- agent-wf-{agent_id}-{session_id}
tenant_id        TEXT NOT NULL             -- For multi-tenancy isolation
agent_id         TEXT                      -- Agent that ran
status           TEXT DEFAULT 'RUNNING'    -- RUNNING | COMPLETED | FAILED
start_time       TIMESTAMPTZ NOT NULL      -- When workflow started
end_time         TIMESTAMPTZ               -- When workflow completed
created_at       TIMESTAMPTZ DEFAULT NOW() -- Record creation time
updated_at       TIMESTAMPTZ DEFAULT NOW() -- Last update time
```

**Indexes:**
```sql
-- Query by tenant + time (most common)
idx_workflow_executions_tenant_time ON (tenant_id, start_time DESC)

-- Query by status
idx_workflow_executions_status ON (status, start_time DESC)

-- Query by agent
idx_workflow_executions_agent ON (agent_id, start_time DESC)
```

**Population Strategy:**
- Workflows populate this table when they start/end
- Used as primary source for list/detail queries (faster)
- Temporal used as fallback if workflow not in table yet
- Enables efficient pagination and filtering

### 3. Pricing Model Architecture

#### Storage Structure

**Location:** `platform_config` table (existing)  
**Key:** `"pricing_model"`  
**Format:** JSON object

```json
{
  "claude-3-5-sonnet-20241022": 3.0,
  "claude-opus-4-20250514": 15.0,
  "claude-opus-4": 15.0,
  "gpt-4-turbo": 10.0
}
```

#### Retrieval & Calculation

**Function: getPricingModel()**
```go
func (h *AdminHandler) getPricingModel(ctx context.Context) map[string]float64 {
    // 1. Query platform_config table
    // 2. Unmarshal JSON
    // 3. Return map or default fallback
    // Default: $5/1M tokens
}
```

**Function: calculateCost()**
```go
func (h *AdminHandler) calculateCost(ctx context.Context, 
    tokensIn, tokensOut int64) float64 {
    
    // Get pricing model
    pricing := h.getPricingModel(ctx)
    
    // Calculate: (tokens / 1,000,000) * price
    totalTokens := float64(tokensIn + tokensOut)
    return (totalTokens / 1000000.0) * avgPrice
}
```

#### Phase 5 vs Phase 6

| Aspect | Phase 5 | Phase 6 |
|--------|---------|---------|
| Storage | platform_config (JSON) | Same + UI editor |
| Retrieval | Database query | Same |
| Calculation | Per query | Same |
| Model-specific | No (uses default) | Yes (per model) |
| UI | None (hardcoded) | Pricing admin panel |

### 4. Frontend Architecture

#### Execution Detail Page: Live Polling

**State Management:**
```typescript
const [pollingInterval, setPollingInterval] = useState<number | false>(1000);

// Polling loop
const { data: execution } = useQuery({
  queryKey: ["execution", sessionId],
  queryFn: () => adminApi.getExecution(sessionId),
  refetchInterval: pollingInterval, // 1000ms or false to disable
});

// Auto-disable on completion
useEffect(() => {
  if (execution?.status !== "RUNNING") {
    setPollingInterval(false);
  }
}, [execution?.status]);
```

**Timeline Rendering:**

1. **Event Nodes** (Horizontal flow)
   ```
   💭 ─── 🔧 ─── ✅ ─── 💬 ─── 🏁
   thinking tool_call result text done
   ```

2. **Detail Cards** (Below timeline)
   - Collapsible JSON for args/results
   - Full text for thinking/messages
   - Error highlighting in red

**Performance Characteristics:**
- Initial load: ~500-1000ms (API + render)
- Polling update: ~300-500ms (refetch + rerender)
- No flickering (React Query handles stale data)
- Memory stable (auto-cleanup on unmount)

#### Cost Page: USD Display

**Summary Stats Calculation:**
```typescript
const summaryStats = useMemo(() => {
  const totalCost = costs.reduce((sum, c) => sum + (c.cost_usd || 0), 0);
  return { totalCostUSD: totalCost, ... };
}, [costs]);
```

**Table Display:**
```typescript
// Each row shows: Tenant | Tokens In | Tokens Out | Sandbox | Cost (USD)
<td className="py-3 px-4 text-right">${(cost.cost_usd || 0).toFixed(2)}</td>
```

**Responsive Grid:**
```css
/* Mobile: 1 column */
grid-cols-1

/* Tablet: 2 columns */
md:grid-cols-2

/* Desktop: 5 columns (Total Tokens, Sandbox, Most Active, Total Cost, Tenants) */
lg:grid-cols-5
```

## API Contracts

### GET /api/v1/admin/cost

**Query Parameters:**
- `period`: "7d", "30d", "90d" (default: "30d")

**Response:**
```json
{
  "costs": [
    {
      "tenant_id": "acme-corp",
      "tokens_in": 1000000,
      "tokens_out": 500000,
      "sandbox_ms": 5000,
      "cost_usd": 4.50
    }
  ],
  "period": "30d",
  "count": 1
}
```

### GET /api/v1/admin/executions

**Query Parameters:**
- `limit`: 1-100 (default: 20)
- `tenant_id`: Filter by tenant
- `status`: RUNNING | COMPLETED | FAILED | CANCELLED

**Response:**
```json
{
  "executions": [
    {
      "session_id": "agent-wf-agent-123-session-456",
      "tenant_id": "acme-corp",
      "agent_id": "agent-123",
      "status": "COMPLETED",
      "start_time": "2026-04-27T10:30:00Z",
      "end_time": "2026-04-27T10:32:15Z",
      "duration_ms": 135000,
      "event_count": 12
    }
  ],
  "count": 1
}
```

### GET /api/v1/admin/executions/{id}

**Response:**
```json
{
  "session_id": "agent-wf-agent-123-session-456",
  "status": "COMPLETED",
  "start_time": "2026-04-27T10:30:00Z",
  "end_time": "2026-04-27T10:32:15Z",
  "duration_ms": 135000,
  "events": [
    {
      "type": "thinking",
      "content": "I need to analyze the user's request..."
    },
    {
      "type": "tool_call",
      "name": "search",
      "args": "{\"query\": \"...\"}"
    },
    {
      "type": "tool_result",
      "result": "{\"results\": [...]}"
    }
  ]
}
```

## Data Flow Diagrams

### Cost Calculation Flow
```
Frontend: User clicks /cost
         │
         ├─→ API: GET /api/v1/admin/cost?period=30d
                   │
                   ├─→ DB: SELECT SUM(tokens_in), SUM(tokens_out)
                   │       FROM cost_events
                   │       WHERE time > NOW() - INTERVAL
                   │
                   ├─→ Pricing: Load from platform_config
                   │
                   ├─→ Calculate: (tokens / 1M) * price
                   │
                   └─→ Response: { costs[], cost_usd: [...] }
         │
         └─→ Frontend: Display summary cards + tables
```

### Execution Detail Flow
```
Frontend: User navigates to /executions/[id]
         │
         ├─→ useQuery({ refetchInterval: 1000 })
         │   │
         │   ├─→ API: GET /api/v1/admin/executions/{id}
         │   │         │
         │   │         ├─→ DB: SELECT * FROM workflow_executions
         │   │         │       WHERE workflow_id = $1
         │   │         │
         │   │         ├─→ Temporal: DescribeWorkflowExecution()
         │   │         │             + QueryWorkflow("get_events")
         │   │         │
         │   │         └─→ Response: { status, events: [...] }
         │   │
         │   └─→ (if status !== RUNNING) stop polling
         │
         └─→ Frontend: Render timeline + event details
```

## Error Handling Strategy

### Temporal Unavailable
```
1. Query workflow_executions table (primary)
2. Fall back to Temporal if needed
3. Return 404 if both unavailable
```

### Missing Pricing Model
```
1. Try load from platform_config
2. Use default ($3/1M tokens)
3. Never fail cost calculation
```

### Invalid Filters
```
1. Ignore invalid status values
2. Use empty tenant_id as "all tenants"
3. Cap limit to 100, min 1
```

## Performance Optimization

### Query Performance
- **Indexes:** All list queries use indexes
- **Filtering:** Applied at DB level, not in application
- **Pagination:** Limit enforced in query (not retrieved all)

### Frontend Performance
- **React Query:** Automatic caching and deduplication
- **Polling:** Stops automatically on completion
- **Memoization:** Summary stats use useMemo

### API Performance
- **Response time:** All endpoints <100ms typical
- **Concurrent requests:** No locking, safe for parallel requests
- **Memory:** Streaming used where applicable

## Security Considerations

### Authentication
- Bearer token required on all admin endpoints
- Validated in middleware before handler

### Authorization
- Single admin role for Phase 5
- Phase 6: Add role-based access control

### Data Isolation
- Multi-tenancy via tenant_id in queries
- RLS enforced on PostgreSQL level

### Sensitive Data
- Pricing model not exposed to non-admins
- Execution events redacted for non-owning tenants (future)

## Monitoring & Observability

### Metrics to Track
- Cost per tenant (daily/monthly)
- Execution success rate
- Average execution duration
- Polling frequency impact

### Logs to Collect
- API endpoint access
- Temporal connection errors
- Database query performance
- Pricing model changes

### Alerts to Set
- Execution failure spike
- Cost threshold exceeded
- API latency degradation
- Temporal connection loss

## Future Enhancements (Phase 6+)

1. **Historical Data:** Backfill workflow_executions for past executions
2. **Advanced Filtering:** Date range, agent type, skill-based
3. **Export:** CSV/JSON export of executions and costs
4. **Webhooks:** Cost alerts, execution completion webhooks
5. **Dashboard:** Charts and graphs for cost trends
6. **Forecasting:** Predict monthly costs based on trends
