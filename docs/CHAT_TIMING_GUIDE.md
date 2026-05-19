# Chat Roundtrip Timing Guide

This guide explains how to trace and analyze the complete chat request flow to identify performance bottlenecks.

## Architecture Overview

Chat requests flow through these segments:

```
[Agent Studio Frontend]
    ↓ (WebSocket or SSE)
[API Gateway :8080]
    ↓
[Workflow Initiator :8081]  ← Dispatches to Temporal
    ↓
[Temporal Server]  ← Queues workflow
    ↓
[Agent Worker] ← Executes workflow, runs ReAct loop
    ↓
[LLM Gateway :8083]  ← Handles LLM requests
    ↓
[Corporate Proxy or Platform liteLLM]  ← Returns response
    ↓
[Response streams back through the chain]
```

## Timing Points Instrumented

### Frontend (Agent Studio)

**Console Output Location:** Browser DevTools → Console

Timing logs show in the console with `[ChatTiming]` prefix:

```
[ChatTiming] Started session: msg-12345
[ChatTiming] Message sent from UI: 2ms
[ChatTiming] UI state updated: 5ms (total: 7ms)
[ChatTiming] WebSocket connected: 150ms (total: 157ms)
[ChatTiming] Message sent to server: 1ms (total: 158ms)
[ChatTiming] Event received: thinking: 450ms (total: 608ms)
[ChatTiming] Event received: tool_call: 120ms (total: 728ms)
[ChatTiming] Event received: text: 200ms (total: 928ms)
[ChatTiming] Response complete: done: 50ms (total: 978ms)

[ChatTiming] Session Summary: msg-12345 (Total: 978ms)
  Message sent from UI: 2ms
  UI state updated: 5ms (0.5%)
  WebSocket connected: 150ms (15.3%)
  Message sent to server: 1ms (0.1%)
  Event received: thinking: 450ms (46.0%)
  Event received: tool_call: 120ms (12.3%)
  Event received: text: 200ms (20.4%)
  Response complete: done: 50ms (5.1%)
```

**Key Metrics:**
- `Message sent from UI` - Time to add message to React state
- `WebSocket connected` - Time to establish connection
- `Message sent to server` - Time to transmit message
- `Event received` - Time between events (shows LLM processing speed)
- `Response complete` - Total roundtrip time

**How to Capture:**
1. Open Agent Studio at `http://localhost:3000`
2. Open Browser DevTools (F12)
3. Go to Console tab
4. Send a message to an agent
5. Watch `[ChatTiming]` logs in real-time

### Backend - Workflow Initiator

**Log Location:** Docker container logs

```bash
docker logs workflow-initiator | grep TIMING
```

**Example Output:**

```
[TIMING] HandleStartSession START: agent_id=sre-agent, session_id=sess-123
[TIMING] Manifest fetch completed in 145ms: model=claude-sonnet-4-6, system_prompt_len=512, max_iterations=20
[TIMING] Started workflow: ID=agent-wf-sre-agent-sess-123, RunID=abc123 (dispatch=25ms, total=170ms)
```

**Key Metrics:**
- `Manifest fetch` - Time to retrieve agent configuration from registry
- `workflow dispatch` - Time for Temporal to accept and queue the workflow
- `total` - End-to-end time for session setup

### Backend - LLM Gateway

**Log Location:** Docker container logs

```bash
docker logs llm-gateway | grep TIMING
```

**Example Output:**

```
[TIMING] Anthropic Inference START: model=claude-sonnet-4-6
=== Anthropic Request ===
URL: https://llm-inference.internal.angelone.in/v1/messages
Model: claude-sonnet-4-6
Auth Key: sk--d-AWAt...G7GvpvGNkw
=== Anthropic Response ===
Status Code: 200
[TIMING] HTTP request completed in 2150ms
[TIMING] Response decoded in 5ms, total time: 2155ms
```

Or for liteLLM:

```
[TIMING] liteLLM HTTP request completed in 1890ms
[TIMING] liteLLM response decoded in 3ms
```

**Key Metrics:**
- `HTTP request completed` - Time for actual LLM API call (largest segment)
- `Response decoded` - Time to parse response JSON

## Analyzing Performance

### Step-by-Step Analysis

#### 1. **Get Total Roundtrip Time**

From Agent Studio console, note the total time in the final summary:

```
[ChatTiming] Session Summary: msg-12345 (Total: 978ms)
```

**Expected:** 500-1500ms for normal operations

#### 2. **Identify Slow Segment**

Look at the percentage breakdown in the summary:

```
Event received: thinking: 450ms (46.0%)  ← 46% of total
Event received: text: 200ms (20.4%)
Event received: tool_call: 120ms (12.3%)
```

- **If `Event received` times are large** → LLM is slow
  - Check LLM Gateway timing
  - Check corporate proxy or liteLLM performance

- **If `WebSocket connected` time is large** → Network latency
  - Check API Gateway connectivity
  - Check Workflow Initiator queuing

- **If session setup is slow** → Agent initialization issue
  - Check Manifest fetch time
  - Check Temporal dispatch

#### 3. **Drill Down into LLM Gateway**

```bash
docker logs llm-gateway | grep -A 3 "TIMING.*Inference START"
```

If LLM response is slow:
- `HTTP request completed: 2150ms` = LLM API call time
  - This is **not the platform's issue** - it's the LLM provider/proxy speed
  - Check corporate proxy logs: `docker exec llm-inference-container logs`

- `Response decoded: 5ms` = Quick, so no parsing issue

#### 4. **Check Workflow Initiator Manifest Fetch**

```bash
docker logs workflow-initiator | grep "Manifest fetch"
```

If manifest fetch is slow (> 500ms):
- Check Agent Registry at `:8088`
- Check database connectivity

#### 5. **Compare Segments**

Create a spreadsheet to track:

```
Time (ms) | Segment              | % of Total | Status
---------|----------------------|-----------|--------
978      | Total                | 100%      | ✓ OK
450      | LLM Response         | 46.0%     | ← Largest
200      | Text Streaming       | 20.4%     | ✓ OK
150      | Network/Queue        | 15.3%     | ✓ OK
120      | Tool Execution       | 12.3%     | ✓ OK
50       | Response Complete    | 5.1%      | ✓ OK
```

## Common Slowness Scenarios

### Scenario 1: LLM API is Slow

**Symptoms:**
```
[TIMING] HTTP request completed in 5000ms  ← Very high
```

**Root Cause:**
- Corporate proxy is overloaded
- LLM provider is slow
- Network latency to corporate proxy

**Action:**
- Check corporate proxy logs
- Test proxy directly: `curl -X POST https://llm-inference.internal.angelone.in/v1/messages ...`
- Monitor proxy CPU/memory usage
- Increase proxy worker threads

### Scenario 2: Network Connection is Slow

**Symptoms:**
```
[ChatTiming] WebSocket connected: 2000ms (total: 2050ms)
```

**Root Cause:**
- DNS resolution slow
- Network latency
- API Gateway queued

**Action:**
- Check Docker network: `docker network inspect bridge`
- Test connectivity: `docker exec api-gateway curl http://localhost:8081/health`
- Check API Gateway logs for request queuing

### Scenario 3: Agent Initialization is Slow

**Symptoms:**
```
[TIMING] Manifest fetch completed in 1500ms
```

**Root Cause:**
- Agent Registry database slow
- Agent configuration large
- Network to registry slow

**Action:**
- Check Agent Registry logs
- Run: `curl http://localhost:8088/agents/YOUR_AGENT_ID`
- Check database query time

### Scenario 4: Temporal Workflow Queuing Delay

**Symptoms:**
```
[TIMING] Started workflow: dispatch=500ms ← High dispatch time
```

**Root Cause:**
- Temporal Server overloaded
- Worker not pulling tasks
- Workflow queue backed up

**Action:**
- Check Temporal UI: `http://localhost:8088` (if running)
- Check worker logs: `docker logs agent-workers`
- Check task queue depth

## Real-Time Monitoring Script

### Frontend Monitoring

```javascript
// Paste in browser console to get live summary every message
window.chatTimings = [];
const originalLog = console.log;
console.log = function(...args) {
  if (args[0]?.includes?.('[ChatTiming]')) {
    const msg = args[0];
    if (msg.includes('Session Summary')) {
      const totalMatch = msg.match(/Total: (\d+)ms/);
      if (totalMatch) {
        window.chatTimings.push({
          timestamp: new Date().toLocaleTimeString(),
          totalMs: parseInt(totalMatch[1])
        });
        console.log(`📊 Avg: ${(window.chatTimings.reduce((a,b) => a+b.totalMs, 0)/window.chatTimings.length).toFixed(0)}ms`);
      }
    }
  }
  originalLog.apply(console, args);
};
```

### Backend Monitoring

```bash
# Watch timing logs in real-time
docker-compose logs -f llm-gateway | grep TIMING &
docker-compose logs -f workflow-initiator | grep TIMING &
```

## Baseline Numbers

**Expected Performance (with corporate proxy):**

| Component | Expected Time | Acceptable Range |
|-----------|---|---|
| Network round-trip | 50-200ms | < 500ms |
| Manifest fetch | 50-150ms | < 500ms |
| Temporal dispatch | 10-50ms | < 100ms |
| LLM API call | 1000-3000ms | < 5000ms |
| Total roundtrip | 1500-3500ms | < 5000ms |

**Interpretation:**
- 1000-1500ms = Excellent
- 1500-3000ms = Good (within acceptable range)
- 3000-5000ms = Slow, investigate LLM provider
- \> 5000ms = Problem, check bottleneck

## Troubleshooting Checklist

- [ ] Check frontend timing console logs
- [ ] Verify WebSocket connection time
- [ ] Check LLM Gateway HTTP request time
- [ ] Verify corporate proxy is responding (`curl` test)
- [ ] Check workflow-initiator manifest fetch time
- [ ] Monitor agent-workers logs for task processing
- [ ] Check Docker network connectivity
- [ ] Monitor system resources (CPU, memory)
- [ ] Test with different agents
- [ ] Compare with baseline numbers

## Next Steps

If slowness persists:

1. **Report timing breakdown** from Agent Studio console
2. **Share backend logs** with timing markers
3. **Document corporate proxy metrics** from their side
4. **Provide system metrics** (CPU, memory, network during test)

Example report:
```
Frontend: 978ms total
  - Network/Connection: 150ms (15%)
  - LLM Response: 450ms (46%)
  - Text Processing: 200ms (20%)
  
Backend:
  - Manifest fetch: 145ms
  - Workflow dispatch: 25ms
  - LLM HTTP: 2150ms

Bottleneck: LLM HTTP request (2150ms) is 2.2x slower than expected
Action: Check corporate proxy load and capacity
```
