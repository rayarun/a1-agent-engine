# Kubernetes Deployment Updates (2026-05-15)

This document summarizes all k8s configuration updates made to align with recent service changes and architecture additions.

## New Services Added to K8s

### 1. **kg-service** (Knowledge Graph Service)
- **Port:** 8093
- **Purpose:** Graph database and semantic search for agent knowledge
- **Key Environment Variables:**
  - `DATABASE_URL` (from secret)
  - `LLM_GATEWAY_URL` (default: `http://llm-gateway:8083`)
- **Staging Config:** 1 replica, debug logging, 128Mi memory
- **Production Config:** 2 replicas, info logging, 256Mi memory, HPA enabled (2-5 replicas)

**Charts Created:**
- `infra/k8s/charts/kg-service/`
- `infra/k8s/envs/staging/kg-service.yaml`
- `infra/k8s/envs/production/kg-service.yaml`

### 2. **mcp-registry** (Model Context Protocol Hub)
- **Port:** 8090
- **Purpose:** MCP client registry for protocol server connections
- **Key Environment Variables:**
  - `DATABASE_URL` (from secret)
  - `PORT=8090`
- **Staging Config:** 1 replica, debug logging
- **Production Config:** 2 replicas, info logging, HPA enabled (2-4 replicas)

**Charts Created:**
- `infra/k8s/charts/mcp-registry/`
- `infra/k8s/envs/staging/mcp-registry.yaml`
- `infra/k8s/envs/production/mcp-registry.yaml`

### 3. **bash-executor** (Bash Execution Sandbox)
- **Port:** 8092
- **Purpose:** Safe sandbox for bash command execution
- **Key Environment Variables:**
  - `PORT=8092`
  - `MAX_MEMORY_MB=512` (1024 in prod)
  - `MAX_CPU_CORES=2` (4 in prod)
  - `MAX_TIMEOUT_SECONDS=3600` (7200 in prod)
  - `MAX_OUTPUT_BYTES=67108864`
- **Staging Config:** 1 replica, 512Mi memory limit, 2 CPU cores max
- **Production Config:** 2 replicas, 2048Mi memory limit, 4 CPU cores max, HPA enabled (2-6 replicas)

**Charts Created:**
- `infra/k8s/charts/bash-executor/`
- `infra/k8s/envs/staging/bash-executor.yaml`
- `infra/k8s/envs/production/bash-executor.yaml`

## Updated Existing Services

### skill-dispatcher
**Changes:** Added KG Gateway URL configuration
- **Updated files:**
  - `infra/k8s/charts/skill-dispatcher/values.yaml` - Added `KG_GATEWAY_URL: "http://kg-service:8093"`
  - `infra/k8s/envs/staging/skill-dispatcher.yaml` - Added KG_GATEWAY_URL
  - `infra/k8s/envs/production/skill-dispatcher.yaml` - Added KG_GATEWAY_URL
- **Why:** skill-dispatcher now supports KG semantic search tool and needs to route KG requests

### admin-api
**Changes:** Added KG Service URL configuration
- **Updated files:**
  - `infra/k8s/charts/admin-api/values.yaml` - Added `KG_SERVICE_URL: "http://kg-service:8093"`
- **Why:** admin-api manages KG resources via platform APIs

## Service Port Mapping (Updated)

| Service | Port | Type | Notes |
|---------|------|------|-------|
| api-gateway | 8080 | Entry point | HTTP webhook ingress |
| workflow-initiator | 8081 | Temporal dispatcher | Temporal task queue |
| agent-workers | 8082 | Temporal worker | Executes agent workflows |
| llm-gateway | 8083 | LLM proxy | Claude API routing |
| sub-agent-registry | 8084 | Registry | Sub-agent configurations |
| skill-dispatcher | 8085 | Dispatcher | Skill + Tool routing |
| tool-registry | 8086 | Registry | Tool definitions |
| skill-catalog | 8087 | Catalog | Skill marketplace |
| agent-registry | 8088 | Registry | Agent definitions |
| admin-api | 8089 | Admin plane | Platform admin API |
| mcp-registry | 8090 | MCP hub | **NEW** - MCP protocol hub |
| mcp-server | 8091 | MCP endpoint | MCP server handler |
| bash-executor | 8092 | Executor | **NEW** - Bash sandbox |
| kg-service | 8093 | KG engine | **NEW** - Knowledge graphs |

## Deployment Validation Checklist

### Pre-Deployment
- [ ] All 17 service charts present in `infra/k8s/charts/`
- [ ] All staging environment overrides present in `infra/k8s/envs/staging/`
- [ ] All production environment overrides present in `infra/k8s/envs/production/`
- [ ] ECR image repositories created for new services (kg-service, mcp-registry, bash-executor)
- [ ] AWS secrets provisioned:
  - [ ] `postgres-credentials` (DATABASE_URL) in both namespaces
  - [ ] `admin-api-db-secret` and `admin-api-auth-secret` if using separate secrets
  - [ ] `llm-gateway-secrets` (API keys) if required

### Helm Dependency Updates
```bash
# Update Helm dependency cache
helm dependency update infra/k8s/charts/kg-service
helm dependency update infra/k8s/charts/mcp-registry
helm dependency update infra/k8s/charts/bash-executor
```

### Staging Deployment
```bash
# Deploy all services to staging
for svc in admin-api admin-console agent-registry agent-studio agent-workers \
           api-gateway dashboard kg-service llm-gateway mcp-registry bash-executor \
           sandbox-manager skill-catalog skill-dispatcher sub-agent-registry \
           tool-registry workflow-initiator; do
  echo "Deploying $svc to staging..."
  helm upgrade --install $svc infra/k8s/charts/$svc/ \
    --namespace a1-staging \
    -f infra/k8s/envs/staging/$svc.yaml \
    --set image.tag=<GIT_SHA> \
    --atomic --timeout 5m
done
```

### Post-Deployment Validation
- [ ] All pods in `a1-staging` namespace are Running
  ```bash
  kubectl get pods -n a1-staging -o wide
  ```
- [ ] All services have endpoints:
  ```bash
  kubectl get svc -n a1-staging
  ```
- [ ] Health check endpoints respond:
  ```bash
  kubectl port-forward -n a1-staging svc/kg-service 8093:8093 &
  curl http://localhost:8093/health
  ```
- [ ] Logs show no critical errors:
  ```bash
  kubectl logs -n a1-staging -l app=kg-service --tail=50
  ```

## Configuration Notes

### Database Initialization
- All new services require the PostgreSQL schema to be applied
- Ensure migration job completes before deploying kg-service:
  ```bash
  kubectl get jobs -n a1-staging -w
  ```

### Resource Limits (Production)
New services have higher resource requirements:
- **kg-service:** 200m→500m CPU, 256Mi→512Mi memory
- **bash-executor:** 500m→2000m CPU, 512Mi→2048Mi memory (can run large tasks)
- **mcp-registry:** 100m→250m CPU, 128Mi→256Mi memory

Verify cluster has sufficient capacity before deploying.

### HPA Configuration
Production deployments have autoscaling enabled:
- **kg-service:** 2-5 replicas (70% CPU threshold)
- **mcp-registry:** 2-4 replicas (70% CPU threshold)
- **bash-executor:** 2-6 replicas (70% CPU threshold)

Metrics server must be installed for HPA to function:
```bash
kubectl get deployment metrics-server -n kube-system
```

### Pod Anti-Affinity (Production)
Production deployments prefer spreading pods across nodes for resilience. Ensure your EKS cluster has at least 2 nodes per availability zone.

## Rollback Plan

If issues occur after deployment:

```bash
# Rollback single service
helm rollback kg-service -n a1-staging

# Rollback all services
for svc in admin-api admin-console agent-registry agent-studio agent-workers \
           api-gateway dashboard kg-service llm-gateway mcp-registry bash-executor \
           sandbox-manager skill-catalog skill-dispatcher sub-agent-registry \
           tool-registry workflow-initiator; do
  helm rollback $svc -n a1-staging
done
```

## Next Steps

1. **Update image builds:** Ensure CI/CD pipeline builds Docker images for new services
2. **Test load scenarios:** New services handle concurrent requests
3. **Monitor metrics:** Set up Prometheus scraping for new service metrics
4. **Document runbooks:** Add incident response procedures for kg-service, mcp-registry, bash-executor failures

## References

- [DEPLOY.md](./DEPLOY.md) - Service deployment procedures
- [README.md](./README.md) - K8s deployment overview
- [TROUBLESHOOT.md](./TROUBLESHOOT.md) - Common deployment issues
