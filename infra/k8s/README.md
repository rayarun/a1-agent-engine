# Kubernetes Deployment — A1 Agent Engine

This directory contains Helm charts for deploying the A1 Agent Engine to Kubernetes (EKS staging and production). Local development continues to use Docker Compose (`infra/local/`).

## Directory Structure

```
infra/k8s/
├── charts/
│   ├── _lib/                    # Shared Helm library (parameterized templates)
│   ├── api-gateway/
│   ├── workflow-initiator/
│   ├── sandbox-manager/         # Special: DaemonSet for Docker-in-Docker
│   ├── llm-gateway/             # Special: API key secrets
│   ├── sub-agent-registry/
│   ├── skill-dispatcher/
│   ├── tool-registry/
│   ├── skill-catalog/
│   ├── agent-registry/
│   ├── agent-workers/           # Special: No HTTP service, Temporal worker
│   ├── agent-studio/            # Special: Env-specific images
│   └── dashboard/
└── envs/
    ├── _shared/
    │   ├── infra-staging.yaml
    │   └── infra-production.yaml
    ├── staging/
    │   └── <service>.yaml × 12
    └── production/
        └── <service>.yaml × 12
```

## Quick Start

### Prerequisites

- `helm` 3.10+
- `kubectl` configured to access your EKS cluster
- K8s Secrets provisioned in your cluster (postgres-credentials, llm-gateway-secrets, etc.)

### Deploy a Single Service to Staging

```bash
# First time only: resolve library chart dependency
helm dependency build infra/k8s/charts/api-gateway/

# Deploy (or upgrade) api-gateway to staging
helm upgrade --install api-gateway \
  infra/k8s/charts/api-gateway/ \
  --namespace a1-staging \
  --create-namespace \
  -f infra/k8s/envs/staging/api-gateway.yaml \
  --set image.tag=abc1234 \
  --atomic \
  --timeout 5m

# Verify deployment
kubectl get deployments -n a1-staging
kubectl logs -n a1-staging deployment/api-gateway
```

### Deploy All Services to Staging

```bash
#!/bin/bash

SERVICES=(
  api-gateway
  workflow-initiator
  sandbox-manager
  llm-gateway
  sub-agent-registry
  skill-dispatcher
  tool-registry
  skill-catalog
  agent-registry
  agent-workers
  agent-studio
  dashboard
)

IMAGE_TAG="abc1234"  # git SHA

for svc in "${SERVICES[@]}"; do
  helm upgrade --install "$svc" \
    "infra/k8s/charts/$svc/" \
    --namespace a1-staging \
    --create-namespace \
    -f "infra/k8s/envs/staging/$svc.yaml" \
    --set "image.tag=$IMAGE_TAG" \
    --atomic --timeout 5m
  echo "✓ $svc deployed"
done
```

### Dry-run Preview

Always preview before deploying to production:

```bash
helm upgrade --install api-gateway \
  infra/k8s/charts/api-gateway/ \
  -f infra/k8s/envs/staging/api-gateway.yaml \
  --set image.tag=abc1234 \
  --dry-run --debug
```

### Rollback

```bash
helm rollback api-gateway 0 --namespace a1-staging
```

## Architecture

### Library Chart Pattern

All 12 service charts delegate to a shared library (`_lib`) which contains:

- **`_deployment.yaml`** — Parameterized Deployment/DaemonSet template (handles sandbox-manager, agent-workers, etc.)
- **`_service.yaml`** — Conditional Service (disabled for agent-workers)
- **`_configmap.yaml`** — Environment variables (non-sensitive)
- **`_hpa.yaml`** — Horizontal Pod Autoscaler (optional)
- **`_ingress.yaml`** — Ingress rules (optional, ALB on EKS)

Service charts are thin wrappers:
```yaml
# infra/k8s/charts/api-gateway/templates/deployment.yaml
{{- include "a1-lib.deployment" . }}
```

### ConfigMap vs Secret Pattern

**ConfigMap (non-sensitive)** — service URLs, log levels, Temporal endpoints. Rendered from `config:` in values.yaml:
```yaml
config:
  WORKFLOW_INITIATOR_URL: "http://workflow-initiator:8081"
  LOG_LEVEL: "debug"
```

**Secret (sensitive)** — API keys, DB passwords. Provisioned **out-of-band** and referenced via `secretRefs:`:
```yaml
secretRefs:
  - envVarName: OPENAI_API_KEY
    secretName: llm-gateway-secrets
    secretKey: openai-api-key
```

Secrets are never stored in values files. Bootstrap them once per cluster/namespace:
```bash
kubectl create secret generic llm-gateway-secrets -n a1-staging \
  --from-literal=openai-api-key='sk-...' \
  --from-literal=anthropic-api-key='sk-ant-...'
```

In production, use AWS Secrets Manager + External Secrets Operator for automatic syncing.

## Special Cases

### sandbox-manager — DaemonSet + Docker Socket

Runs as a **DaemonSet** (one pod per node) with privileged access to `/var/run/docker.sock`. Only nodes labeled `a1/sandbox=true` will run sandbox-manager:

```bash
# Label nodes for sandbox workloads
kubectl label nodes <node-name> a1/sandbox=true
```

Configuration in `infra/k8s/charts/sandbox-manager/values.yaml`:
```yaml
workloadType: DaemonSet
containerSecurityContext:
  privileged: true
volumes:
  - name: docker-sock
    hostPath:
      path: /var/run/docker.sock
      type: Socket
volumeMounts:
  - name: docker-sock
    mountPath: /var/run/docker.sock
nodeSelector:
  a1/sandbox: "true"
tolerations:
  - key: "a1/sandbox"
    operator: Equal
    value: "true"
    effect: NoSchedule
```

### agent-workers — Temporal Worker (No HTTP Service)

Temporal worker pod with no HTTP port exposed:
```yaml
service:
  enabled: false
containerPort: null
readinessProbe:
  exec:
    command: ["python", "-c", "import temporalio"]
```

Autoscaling on task queue depth requires **KEDA** (Kubernetes Event-Driven Autoscaling). Future enhancement:
```yaml
keda:
  enabled: true
  minReplicas: 1
  maxReplicas: 20
  queueLength: 30  # Target queue depth
```

### agent-studio — Environment-Specific Images

`NEXT_PUBLIC_*` environment variables are baked into the Next.js bundle at **build time**. The image itself is environment-specific.

**CI must build two images:**
- `agent-studio:<sha>-staging` — with staging `NEXT_PUBLIC_*` build args
- `agent-studio:<sha>-prod` — with production `NEXT_PUBLIC_*` build args

Deploy by specifying the correct tag suffix:
```bash
# Staging
helm upgrade --install agent-studio ... \
  --set image.tag=abc1234-staging

# Production
helm upgrade --install agent-studio ... \
  --set image.tag=abc1234-prod
```

### llm-gateway — LLM Provider Credentials

Requires Kubernetes Secrets with OpenAI and Anthropic API keys:

```bash
kubectl create secret generic llm-gateway-secrets -n a1-staging \
  --from-literal=openai-api-key='sk-...' \
  --from-literal=anthropic-api-key='sk-ant-...' \
  --from-literal=anthropic-base-url='https://api.anthropic.com'
```

The chart references them but does not store values:
```yaml
secretRefs:
  - envVarName: OPENAI_API_KEY
    secretName: llm-gateway-secrets
    secretKey: openai-api-key
  - envVarName: ANTHROPIC_API_KEY
    secretName: llm-gateway-secrets
    secretKey: anthropic-api-key
```

## Environment Overlays

### Staging (`envs/staging/`)
- 1-2 replicas per service
- HPA disabled
- Log level: `debug`
- Ingress: internal (VPC-only, ALB with private scheme)
- Resource requests/limits: halved vs production

### Production (`envs/production/`)
- 2-3 replicas minimum
- HPA enabled (3-10 replicas max)
- Log level: `info`
- Ingress: internet-facing (ALB with public scheme, ACM TLS)
- Resource requests/limits: production sizing
- Temporal endpoint: Temporal Cloud (prod namespace)

### Customizing for Your Environment

Edit the corresponding YAML files:

```bash
# Update database endpoint for staging
sed -i 's/staging-rds.*/your-rds-endpoint/g' infra/k8s/envs/staging/*.yaml

# Update ingress hostname for production
sed -i 's/a1-agent-engine.example.com/your-domain.com/g' infra/k8s/envs/production/*.yaml
```

## CI/CD Integration

### Image Tag Injection

Image tags are **never committed** to values files. Always inject via `--set`:

```bash
helm upgrade --install <service> \
  infra/k8s/charts/<service>/ \
  -f infra/k8s/envs/staging/<service>.yaml \
  --set image.tag=<git-sha-or-version>
```

### GitHub Actions Example

```yaml
- name: Build & push image
  run: |
    docker build -t $ECR_REPO/api-gateway:${{ github.sha }} \
      -f services/api-gateway/Dockerfile .
    docker push $ECR_REPO/api-gateway:${{ github.sha }}

- name: Deploy to staging
  run: |
    helm upgrade --install api-gateway \
      infra/k8s/charts/api-gateway/ \
      --namespace a1-staging \
      -f infra/k8s/envs/staging/api-gateway.yaml \
      --set image.tag=${{ github.sha }} \
      --atomic --timeout 5m
```

### Monorepo Change Detection

Deploy only services that changed:

```bash
CHANGED=$(git diff --name-only HEAD~1 HEAD | grep '^services/' | cut -d/ -f2 | sort -u)
for svc in $CHANGED; do
  helm upgrade --install $svc infra/k8s/charts/$svc/ ...
done
```

## Debugging

### Check pod status
```bash
kubectl get pods -n a1-staging
kubectl describe pod <pod-name> -n a1-staging
kubectl logs <pod-name> -n a1-staging
```

### View rendered templates
```bash
helm template api-gateway infra/k8s/charts/api-gateway/ \
  -f infra/k8s/envs/staging/api-gateway.yaml \
  --set image.tag=abc1234
```

### Port forwarding
```bash
kubectl port-forward -n a1-staging svc/api-gateway 8080:8080
curl http://localhost:8080/health
```

## Kubernetes Manifests Reference

Each chart produces:

- **Deployment** (or DaemonSet) — pod replica management
- **Service** — DNS and load balancing (optional for agent-workers)
- **ConfigMap** — environment variables (non-sensitive)
- **HPA** — autoscaling policy (optional)
- **Ingress** — external access via ALB (optional)

### Generated manifest example

```yaml
# Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  labels: { app.kubernetes.io/name: api-gateway, ... }
spec:
  replicas: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: api-gateway
      app.kubernetes.io/instance: RELEASE_NAME
  template:
    spec:
      containers:
      - name: api-gateway
        image: ECR.../api-gateway:abc1234
        env:
        - name: WORKFLOW_INITIATOR_URL
          valueFrom:
            configMapKeyRef:
              name: api-gateway-config
              key: WORKFLOW_INITIATOR_URL
---
apiVersion: v1
kind: Service
metadata:
  name: api-gateway
spec:
  type: ClusterIP
  selector:
    app.kubernetes.io/name: api-gateway
  ports:
    - port: 8080
      targetPort: 8080
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-gateway-config
data:
  WORKFLOW_INITIATOR_URL: "http://workflow-initiator:8081"
  LOG_LEVEL: "debug"
```

## Adding a New Service

1. Create a new service chart directory under `infra/k8s/charts/<service-name>/`
2. Copy the structure from an existing service chart (e.g., api-gateway)
3. Update `Chart.yaml` with service-specific metadata
4. Customize `values.yaml` with service-specific defaults (image, port, config, probes)
5. Create environment overrides in `infra/k8s/envs/staging/<service-name>.yaml` and `infra/k8s/envs/production/<service-name>.yaml`
6. Deploy using the standard command

## Troubleshooting

### "library chart not found"
```
Error: chart requires dependencieshelm dependency build infra/k8s/charts/<service>/
```

### Pod stuck in ImagePullBackOff
Check ECR image exists and pod has IAM permissions (IRSA):
```bash
kubectl describe pod <pod-name> -n a1-staging
```

### Ingress not routing traffic
Verify ALB controller is installed and ingress annotations are correct:
```bash
kubectl get ingress -n a1-staging
kubectl describe ingress api-gateway -n a1-staging
```

### Service DNS not resolving
Services are only resolvable within the same namespace. Use FQDN for cross-namespace:
```
http://api-gateway.a1-staging.svc.cluster.local:8080
```

## References

- [Helm Documentation](https://helm.sh/docs/)
- [Temporal Documentation](https://docs.temporal.io)
- [AWS EKS Best Practices](https://docs.aws.amazon.com/eks/latest/userguide/)
- Plan: [`/Users/arun.ray/.claude/plans/glittery-greeting-coral.md`](/Users/arun.ray/.claude/plans/glittery-greeting-coral.md)
