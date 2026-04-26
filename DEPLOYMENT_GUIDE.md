# Deployment Guide: Phase 5 & Beyond

## Pre-Deployment Checklist

### Code Quality
- [ ] TypeScript builds without errors: `npm run build`
- [ ] Go builds without errors: `go build`
- [ ] All tests pass
- [ ] Code reviewed and approved
- [ ] Commit pushed to main branch

### Database
- [ ] All migrations applied to staging
- [ ] Migration script tested on copy of production data
- [ ] Rollback plan documented

### Configuration
- [ ] Environment variables documented
- [ ] Secrets stored in AWS Secrets Manager (production)
- [ ] Feature flags configured correctly
- [ ] CORS headers set appropriately

### Infrastructure
- [ ] VPC/networking rules updated if needed
- [ ] Load balancer configured
- [ ] SSL certificates valid
- [ ] Monitoring/logging set up

## Local Development Deployment

### Quick Start (All Services)

```bash
# 1. Clone repository
git clone https://github.com/your-org/a1-agent-engine.git
cd a1-agent-engine

# 2. Start Docker services
cd infra/local
docker-compose up -d

# Wait for services to be healthy
docker-compose ps

# 3. Apply migrations
cat ../postgres/migrations/*.sql | \
  docker-compose exec -T postgres psql -U postgres -d agentplatform

# 4. Start frontends on host
# Terminal 2
cd apps/admin-console && npm install && npm run dev

# Terminal 3
cd apps/agent-studio && npm install && npm run dev

# 5. Verify
curl http://localhost:3001/admin/cost          # Admin Console
curl http://localhost:3000                     # Agent Studio
curl http://localhost:8089/health              # Admin API
```

### Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5433 | Database |
| Temporal | 7233 | Workflow orchestration |
| API Gateway | 8080 | Primary API |
| Workflow Initiator | 8081 | Temporal dispatcher |
| Admin API | 8089 | Admin endpoints |
| Admin Console | 3001 | Admin UI |
| Agent Studio | 3000 | Tenant UI |

## Staging Deployment

### 1. Build Docker Images

```bash
# From repository root
docker-compose -f infra/local/docker-compose.yml build

# Expected images:
# - admin-api:latest
# - agent-studio:latest (if enabled)
# - postgres:latest (pulls from pgvector/pgvector)
# - temporal:latest (pulls from temporal:latest)
```

### 2. Push to Registry

```bash
# Example: AWS ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com

docker tag admin-api:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/admin-api:v5
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/admin-api:v5
```

### 3. Deploy to Staging Kubernetes

```bash
# Update Helm values
cd infra/k8s/admin-api
# Edit values-staging.yaml with new image tag

# Deploy
helm upgrade --install admin-api ./admin-api \
  -f values.yaml \
  -f values-staging.yaml \
  --namespace staging

# Verify
kubectl get pods -n staging
kubectl logs -f admin-api-0 -n staging
```

### 4. Run Migrations

```bash
# Create migration job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: migrate-workflow-executions
  namespace: staging
spec:
  template:
    spec:
      containers:
      - name: migrate
        image: postgres:latest
        command:
        - sh
        - -c
        - |
          cat /migrations/012_workflow_executions.sql | \
          psql -h postgres-service -U postgres -d agentplatform
        volumeMounts:
        - name: migrations
          mountPath: /migrations
      volumes:
      - name: migrations
        configMap:
          name: migrations
      restartPolicy: Never
  backoffLimit: 3
EOF

# Monitor migration
kubectl logs -f job/migrate-workflow-executions -n staging
```

### 5. Verify Deployment

```bash
# Health check
curl -H "Authorization: Bearer staging-admin-key" \
  https://admin-api-staging.example.com/health
# Expected: { "status": "ok" }

# Cost endpoint
curl -H "Authorization: Bearer staging-admin-key" \
  https://admin-api-staging.example.com/api/v1/admin/cost?period=30d
# Expected: { "costs": [...], "period": "30d", "count": N }

# Executions endpoint
curl -H "Authorization: Bearer staging-admin-key" \
  https://admin-api-staging.example.com/api/v1/admin/executions
# Expected: { "executions": [...], "count": N }
```

### 6. Smoke Tests

```bash
# Admin Console loads
curl -I https://admin-console-staging.example.com/admin/cost
# Expected: HTTP 200

# Cost page data loads
curl -H "Authorization: Bearer staging-admin-key" \
  https://admin-api-staging.example.com/api/v1/admin/cost?period=7d

# Verify cost_usd field present
# Expected response includes: "cost_usd": N.NN
```

## Production Deployment

### 1. Pre-Production Verification

```bash
# Run staging smoke tests
./scripts/smoke-tests.sh staging

# Performance test
./scripts/load-test.sh staging --requests=1000 --concurrency=10

# Security scan
./scripts/security-scan.sh admin-api:latest
```

### 2. Blue-Green Deployment

```bash
# Deploy to "green" environment (parallel to current "blue")
helm upgrade --install admin-api-green ./admin-api \
  -f values.yaml \
  -f values-production-green.yaml \
  --namespace production

# Wait for readiness
kubectl wait --for=condition=Ready pod -l app=admin-api-green \
  -n production --timeout=300s

# Run smoke tests on green
./scripts/smoke-tests.sh production-green

# If successful, switch traffic
kubectl patch service admin-api -n production \
  -p '{"spec":{"selector":{"deployment":"admin-api-green"}}}'

# Monitor for 5 minutes
./scripts/monitor.sh production --duration=5m

# If stable, delete blue
helm uninstall admin-api-blue -n production
```

### 3. Database Backup

```bash
# Before migration
pg_dump -h production-rds.example.com -U admin agentplatform \
  > backup-pre-phase5-$(date +%Y%m%d).sql

# Verify backup
pg_restore --list backup-pre-phase5-*.sql | grep workflow_executions
# Should be empty (new table doesn't exist yet)

# Store securely
aws s3 cp backup-pre-phase5-*.sql s3://backups/agentplatform/
```

### 4. Run Migration

```bash
# Connect to production database
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d agentplatform

# Run migration in transaction
BEGIN;

-- Create table
CREATE TABLE IF NOT EXISTS workflow_executions (
    workflow_id TEXT PRIMARY KEY,
    ...
);

-- Verify table exists
SELECT EXISTS(SELECT 1 FROM information_schema.tables 
  WHERE table_name = 'workflow_executions');

-- Commit or rollback
COMMIT;

-- Verify indexes
SELECT indexname FROM pg_indexes 
WHERE tablename = 'workflow_executions';
```

### 5. Production Verification

```bash
# Production health checks
./scripts/health-check.sh production

# Production smoke tests
./scripts/smoke-tests.sh production

# Monitor metrics
./scripts/monitor.sh production --duration=30m

# Check logs for errors
kubectl logs -f admin-api-0 -n production | grep ERROR
```

## Rollback Procedure

### Immediate Rollback (Within 1 Hour)

```bash
# 1. Switch traffic back to previous version
kubectl patch service admin-api -n production \
  -p '{"spec":{"selector":{"deployment":"admin-api-blue"}}}'

# 2. Monitor for 5 minutes
./scripts/monitor.sh production --duration=5m

# 3. If stable, restart blue deployment
helm upgrade admin-api ./admin-api \
  -f values.yaml \
  -f values-production-blue.yaml \
  --namespace production

# 4. Delete green deployment
helm uninstall admin-api-green -n production
```

### Database Rollback (If Migration Failed)

```bash
# 1. Stop all services (freeze application)
kubectl scale deployment admin-api --replicas=0 -n production

# 2. Restore from backup
pg_restore -h production-rds.example.com -U admin \
  --data-only --disable-triggers backup-pre-phase5-*.sql \
  agentplatform

# 3. Verify restoration
psql -h production-rds.example.com -U admin agentplatform \
  -c "SELECT COUNT(*) FROM cost_events;"

# 4. Restart services
kubectl scale deployment admin-api --replicas=3 -n production

# 5. Verify health
./scripts/health-check.sh production
```

## Monitoring Post-Deployment

### Key Metrics to Track

```
1. API Latency
   - Admin API endpoints should be <100ms p95
   - Cost queries <50ms
   - Execution queries <30ms

2. Error Rate
   - Should be <0.1% for 24 hours
   - Alarm if >0.5%

3. Database Performance
   - Query time for workflow_executions <5ms
   - No slow queries in logs

4. Cost Accuracy
   - Verify cost_usd calculations match manual audit
   - Compare with previous billing cycle

5. Execution Tracking
   - Verify workflow_executions table populating
   - Check for missing executions
```

### Dashboards & Alerts

```yaml
# Prometheus alert rules
groups:
- name: admin-api
  rules:
  - alert: AdminAPIHighLatency
    expr: histogram_quantile(0.95, admin_api_latency_seconds) > 0.1
    for: 5m
    
  - alert: AdminAPIHighErrorRate
    expr: rate(admin_api_errors_total[5m]) > 0.005
    for: 5m
    
  - alert: WorkflowExecutionsQueueBackup
    expr: workflow_executions_pending_count > 1000
    for: 10m
```

## Troubleshooting

### Admin API not starting

```bash
# Check logs
kubectl logs admin-api-0 -n production | tail -50

# Common issues:
# 1. Temporal connection failed
#    → Check TEMPORAL_HOSTPORT env var
#    → Check network connectivity to Temporal

# 2. Database connection failed
#    → Check DATABASE_URL env var
#    → Verify credentials in Secrets Manager

# 3. Migration missing
#    → Check workflow_executions table exists
#    → Run migration manually if needed
```

### Cost queries returning wrong values

```bash
# Verify pricing model in DB
psql -h $DB_HOST -U $DB_USER -d agentplatform \
  -c "SELECT value FROM platform_config WHERE key = 'pricing_model';"

# Verify cost_events have data
psql -h $DB_HOST -U $DB_USER -d agentplatform \
  -c "SELECT COUNT(*), SUM(tokens_in), SUM(tokens_out) FROM cost_events;"

# Manually calculate expected cost
# Expected: (tokens_in + tokens_out) / 1,000,000 * 3.0
```

### Executions not appearing

```bash
# Check workflow_executions table
psql -h $DB_HOST -U $DB_USER -d agentplatform \
  -c "SELECT COUNT(*) FROM workflow_executions;"

# Check Temporal directly
tctl workflow list

# Verify API is populating table
# Add debug logging to HandleStartSession/HandleCompleteSession
```

## Post-Deployment Checklist

- [ ] All endpoints responding correctly
- [ ] Cost calculations accurate
- [ ] Execution tracking working
- [ ] Live polling functioning
- [ ] No errors in application logs
- [ ] Database indexes performing well
- [ ] Monitoring dashboards showing data
- [ ] Alerts triggered successfully
- [ ] Documentation updated
- [ ] Team notified of changes

## Runbooks

### Daily Operations

```bash
# Morning check
./scripts/health-check.sh production
./scripts/check-costs.sh production  # Verify daily costs

# Weekly check
./scripts/performance-report.sh production --period=1w

# Monthly check
./scripts/cost-audit.sh production --period=1m
```

### Emergency Procedures

**Cost Calculation Wrong:**
1. Check platform_config for pricing_model
2. Verify cost_events table has data
3. Run manual calculation query
4. If error found, fix and redeploy

**Execution Tracking Missing:**
1. Check workflow_executions table populated
2. Check Temporal connection
3. Run backfill migration for past workflows
4. Verify API restarted after migration

**High API Latency:**
1. Check database indexes
2. Analyze slow query log
3. Check for table locks
4. Scale horizontally if needed

## Appendix: Environment Variables

### Admin API (services/admin-api)

```bash
# Required
ADMIN_API_KEY=production-admin-key-here
DATABASE_URL=postgres://user:pass@host:5432/agentplatform
TEMPORAL_HOSTPORT=temporal-server.production:7233

# Optional
LOG_LEVEL=info
PORT=8089
```

### Admin Console (apps/admin-console)

```bash
# Required
NEXT_PUBLIC_ADMIN_API_URL=https://admin-api.production.example.com

# Optional
NEXT_PUBLIC_LOG_LEVEL=info
```

## Version Management

### Rolling out changes

```
Phase 5 Release: v5.0.0
  - Temporal integration
  - Execution detail pages
  - Cost calculation

Hotfix: v5.0.1 (if needed)
  - Bug fixes

Next Major: v6.0.0
  - Advanced features (Phase 6)
```
