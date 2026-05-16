# Workflow Trigger Mechanisms

The `workflow-service` supports multiple trigger types for automating workflow execution: manual, webhook, cron, and event-driven.

## Trigger Types

### 1. Manual Trigger

Trigger a workflow run explicitly via API.

**Endpoint:** `POST /api/v1/workflows/{id}/trigger`

**Request:**
```bash
curl -X POST http://localhost:8094/api/v1/workflows/daily-settlement/trigger \
  -H "X-Tenant-ID: org-acme" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "date": "2026-05-16",
      "exchange": "NSE"
    }
  }'
```

**Response:**
```json
{
  "run_id": "uuid-here",
  "status": "pending",
  "message": "Workflow triggered for execution"
}
```

---

### 2. Webhook Trigger

External systems POST events to trigger workflows. Validates HMAC-SHA256 signature.

**Workflow Registration:**
```json
{
  "id": "settlement-webhook",
  "name": "Settlement Webhook Handler",
  "workflow_type": "yaml",
  "task_queue": "platform-hybrid-queue",
  "definition": { ... },
  "trigger_config": {
    "type": "webhook",
    "webhook_secret": "your-secret-key-here"
  }
}
```

**Endpoint:** `POST /api/v1/workflows/{id}/webhooks`

**Request:**
```bash
# Compute HMAC-SHA256 of body
SECRET="your-secret-key-here"
BODY='{"trade_id": "T123", "symbol": "TCS", "amount": 500000}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)

curl -X POST http://localhost:8094/api/v1/workflows/settlement-webhook/webhooks \
  -H "X-Tenant-ID: org-acme" \
  -H "X-Webhook-Signature: $SIGNATURE" \
  -H "Content-Type: application/json" \
  -d "$BODY"
```

**Response:**
```json
{
  "run_id": "uuid-here",
  "status": "pending",
  "message": "Webhook received, workflow queued for execution"
}
```

**Signature Validation:**
- Computed as: `HMAC-SHA256(webhook_secret, request_body)`
- Compared to `X-Webhook-Signature` header
- Disabled locally with `WEBHOOK_HMAC_DISABLED=true`

---

### 3. Cron Trigger

Automatically trigger workflows on a schedule using cron expressions.

**Workflow Registration:**
```json
{
  "id": "daily-settlement-report",
  "name": "Daily Settlement Report",
  "workflow_type": "yaml",
  "task_queue": "platform-hybrid-queue",
  "definition": { ... },
  "trigger_config": {
    "type": "cron",
    "cron": "0 17 * * 1-5"
  }
}
```

**Cron Format:**
```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 7)
│ │ │ │ │
│ │ │ │ │
* * * * *
```

**Examples:**
- `0 9 * * *` — Daily at 9 AM
- `0 17 * * 1-5` — Weekdays at 5 PM
- `*/5 * * * *` — Every 5 minutes
- `0 0 1 * *` — First day of month at midnight

**Implementation:**
- `workflow-service` on startup queries all cron workflows
- Creates Temporal Schedules via `ScheduleClient`
- Temporal automatically triggers at the scheduled time
- Runs execute on the registered `task_queue`

---

### 4. Event-Driven Trigger

Trigger workflows when external events occur. Multiple workflows can listen to the same event.

**Workflow Registration:**
```json
{
  "id": "settlement-fail-watcher",
  "name": "Settlement Fail Handler",
  "workflow_type": "yaml",
  "task_queue": "platform-hybrid-queue",
  "definition": { ... },
  "trigger_config": {
    "type": "event",
    "event_name": "settlement.fail"
  }
}
```

**Endpoint:** `POST /api/v1/events/{event_name}`

**Request:**
```bash
curl -X POST http://localhost:8094/api/v1/events/settlement.fail \
  -H "X-Tenant-ID: org-acme" \
  -H "Content-Type: application/json" \
  -d '{
    "settlement_id": "S456",
    "reason": "Clearing house netting failed",
    "timestamp": "2026-05-16T17:05:00Z"
  }'
```

**Response:**
```json
{
  "event_name": "settlement.fail",
  "workflows_triggered": 2,
  "message": "Event trigger matched 2 workflows"
}
```

**Behavior:**
- All workflows with `event_name = settlement.fail` are triggered
- Event payload becomes workflow inputs
- Multiple workflows can listen to the same event
- No signature validation (unlike webhooks)

---

## Configuration in Workflow Definition

When registering a workflow, specify the trigger mechanism:

```python
# Register via workflow-service API
POST /api/v1/workflows
{
  "id": "my-workflow",
  "name": "My Hybrid Workflow",
  "workflow_type": "yaml",
  "task_queue": "platform-hybrid-queue",
  "definition": {
    "steps": [...]
  },
  "trigger_config": {
    "type": "webhook",  # or "cron", "event", "manual"
    "webhook_secret": "...",  # for webhook
    "cron": "0 9 * * *",  # for cron
    "event_name": "order.created"  # for event
  }
}
```

---

## Use Cases

### Daily Settlement Report (Cron)
```json
{
  "trigger_config": {
    "type": "cron",
    "cron": "0 17 * * 1-5"
  }
}
```
→ Report generated daily at 5 PM on weekdays

### KYC Verification (Webhook)
```json
{
  "trigger_config": {
    "type": "webhook",
    "webhook_secret": "client-provided-secret"
  }
}
```
→ External KYC system POSTs verification results

### Settlement Failure Recovery (Event)
```json
{
  "trigger_config": {
    "type": "event",
    "event_name": "settlement.fail"
  }
}
```
→ Triggered when clearing house signals a settlement failure

### One-Off Analysis (Manual)
```bash
curl -X POST /api/v1/workflows/ad-hoc-analysis/trigger \
  -d '{"inputs": {...}}'
```
→ Analyst manually triggers investigation

---

## Implementation Notes

### Webhook Signature Generation

**Python:**
```python
import hmac
import hashlib

secret = "your-secret-key"
payload = b'{"event": "trade.executed"}'
signature = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
print(f"X-Webhook-Signature: {signature}")
```

**Go:**
```go
import "crypto/hmac"
import "crypto/sha256"
import "encoding/hex"

secret := "your-secret-key"
payload := []byte(`{"event": "trade.executed"}`)
h := hmac.New(sha256.New, []byte(secret))
h.Write(payload)
signature := hex.EncodeToString(h.Sum(nil))
```

### Temporal Schedule Integration (Phase B.2)

When cron workflows are registered, `workflow-service`:
1. Queries all `trigger_config.type = 'cron'` workflows
2. Connects to Temporal `ScheduleClient`
3. Creates a schedule that fires at the cron interval
4. Each fire triggers `HybridWorkflow` on the registered `task_queue`

```go
// Pseudo-code
scheduleClient := client.NewScheduleClient()
scheduleHandle := await scheduleClient.Create(ctx, client.ScheduleOptions{
    ID: "workflow_" + workflowID,
    Spec: &client.ScheduleSpec{
        Intervals: []client.ScheduleInterval{
            {Start: parseCron(triggerConfig.Cron)},
        },
    },
    Action: &client.ScheduleWorkflowAction{
        ID:       workflowID + "_" + UUID(),
        Workflow: "HybridWorkflow",
        Args: map[string]interface{}{
            "definition": definition,
            "inputs": {},
            "tenant_id": tenantID,
        },
    },
})
```

---

## Error Handling

All trigger endpoints return:

**Success (202 Accepted):**
```json
{
  "run_id": "uuid",
  "status": "pending"
}
```

**Bad Request (400):**
```json
{
  "error": "Invalid trigger config: ..."
}
```

**Unauthorized (401):**
```json
{
  "error": "Invalid webhook signature"
}
```

**Not Found (404):**
```json
{
  "error": "Workflow not found"
}
```

**Server Error (500):**
```json
{
  "error": "Failed to trigger workflow"
}
```
