# Helm Charts Setup & First-Time Deployment

This guide walks through setting up your Kubernetes cluster for the first time and deploying the A1 Agent Engine.

## Prerequisites

### Tools
- `helm` 3.10+ (`brew install helm`)
- `kubectl` configured to EKS cluster
- `aws` CLI v2 with credentials configured
- `git` for version control

### AWS Infrastructure (should already exist)
- **EKS Cluster** — `a1-staging-eks` and `a1-production-eks`
- **RDS Instance** — PostgreSQL 14+ with pgvector extension
- **ElastiCache** — Redis instance
- **Temporal Cloud** — Account and namespace(s)
- **ECR Repositories** — One per service or shared (e.g., `a1/api-gateway`)
- **ACM Certificates** — For ingress TLS

### Kubernetes Prerequisites
```bash
# 1. Verify cluster access
kubectl cluster-info

# 2. Create namespaces
kubectl create namespace a1-staging
kubectl create namespace a1-production

# 3. Verify ALB ingress controller is installed (for ingress support)
kubectl get pods -n kube-system | grep alb
# If not installed, see: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html

# 4. Label nodes for sandbox-manager DaemonSet
kubectl label nodes <node1> <node2> a1/sandbox=true
```

## Step 1: Create Kubernetes Secrets

Secrets must be provisioned **before** deploying any service. These are sensitive values—do NOT commit to git.

### Option A: Manual Creation (Development/Staging)

```bash
# PostgreSQL credentials
kubectl create secret generic postgres-credentials -n a1-staging \
  --from-literal=url='postgresql://user:password@staging-rds.xxxxxxxx.us-east-1.rds.amazonaws.com:5432/agentplatform?sslmode=require'

# LLM Gateway API keys
kubectl create secret generic llm-gateway-secrets -n a1-staging \
  --from-literal=openai-api-key='sk-...' \
  --from-literal=anthropic-api-key='sk-ant-...' \
  --from-literal=anthropic-base-url='https://api.anthropic.com'
```

### Option B: Automated (Production with External Secrets Operator)

Use AWS Secrets Manager + External Secrets Operator for production:

```bash
# 1. Create secret in AWS Secrets Manager
aws secretsmanager create-secret \
  --name prod/a1/postgres-credentials \
  --secret-string '{"url":"postgresql://..."}'

# 2. Install External Secrets Operator (one-time)
helm repo add external-secrets https://charts.external-secrets.io
helm repo update
helm install external-secrets external-secrets/external-secrets \
  -n external-secrets-system --create-namespace

# 3. Create SecretStore resource (per namespace)
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets
  namespace: a1-production
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: external-secrets-sa
  namespace: a1-production
  annotations:
    eks.amazonaws.com/role-arn: arn:aws:iam::ACCOUNT:role/external-secrets-role
EOF

# 4. Create ExternalSecret to sync AWS SM → K8s Secret
kubectl apply -f - <<EOF
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: postgres-credentials
  namespace: a1-production
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets
    kind: SecretStore
  target:
    name: postgres-credentials
    creationPolicy: Owner
  data:
    - secretKey: url
      remoteRef:
        key: prod/a1/postgres-credentials
        property: url
EOF
```

### Verify Secrets

```bash
kubectl get secrets -n a1-staging
kubectl get secret postgres-credentials -n a1-staging -o jsonpath='{.data.url}' | base64 -d
```

## Step 2: Build Library Dependency

The library chart is a dependency. Build it **once per service chart**:

```bash
# For each service chart directory
for chart in infra/k8s/charts/*/; do
  if [ "$(basename $chart)" != "_lib" ]; then
    helm dependency build "$chart"
  fi
done

# Verify Chart.lock was generated
ls -la infra/k8s/charts/api-gateway/Chart.lock
```

## Step 3: Validate Helm Charts

Lint all charts to catch YAML/logic errors early:

```bash
# Lint library
helm lint infra/k8s/charts/_lib/

# Lint all service charts
for chart in infra/k8s/charts/*/; do
  if [ "$(basename $chart)" != "_lib" ]; then
    helm lint "$chart"
  fi
done
```

## Step 4: Preview Deployment

Before deploying, always dry-run to see what will be created:

```bash
# Single service dry-run
helm upgrade --install api-gateway \
  infra/k8s/charts/api-gateway/ \
  --namespace a1-staging \
  -f infra/k8s/envs/staging/api-gateway.yaml \
  --set image.tag=abc1234 \
  --dry-run --debug

# Review the output for any errors or unexpected changes
```

## Step 5: Deploy Initial Services (Staging)

Deploy **infrastructure-dependent** services first, then others:

### Wave 1: Infrastructure Services (already managed outside Helm)
- PostgreSQL (RDS)
- Redis (ElastiCache)
- Temporal (Temporal Cloud or self-hosted)

### Wave 2: Core Services

```bash
SERVICES=(
  tool-registry
  skill-catalog
  sub-agent-registry
  agent-registry
)

for svc in "${SERVICES[@]}"; do
  echo "Deploying $svc..."
  helm upgrade --install "$svc" \
    "infra/k8s/charts/$svc/" \
    --namespace a1-staging \
    -f "infra/k8s/envs/staging/$svc.yaml" \
    --set "image.tag=abc1234" \
    --wait --timeout 5m
  kubectl wait --for=condition=available --timeout=300s \
    deployment/$svc -n a1-staging
done
```

### Wave 3: Orchestration Services

```bash
SERVICES=(
  workflow-initiator
  skill-dispatcher
  api-gateway
)

for svc in "${SERVICES[@]}"; do
  echo "Deploying $svc..."
  helm upgrade --install "$svc" \
    "infra/k8s/charts/$svc/" \
    --namespace a1-staging \
    -f "infra/k8s/envs/staging/$svc.yaml" \
    --set "image.tag=abc1234" \
    --wait --timeout 5m
done
```

### Wave 4: Specialized Services

```bash
SERVICES=(
  sandbox-manager
  llm-gateway
  agent-workers
  agent-studio
  dashboard
)

for svc in "${SERVICES[@]}"; do
  echo "Deploying $svc..."
  helm upgrade --install "$svc" \
    "infra/k8s/charts/$svc/" \
    --namespace a1-staging \
    -f "infra/k8s/envs/staging/$svc.yaml" \
    --set "image.tag=abc1234" \
    --wait --timeout 5m
done
```

## Step 6: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n a1-staging

# Check services
kubectl get services -n a1-staging

# Check ingress
kubectl get ingress -n a1-staging

# Check HPA
kubectl get hpa -n a1-staging

# Sample health check
kubectl exec -it deployment/api-gateway -n a1-staging -- \
  curl -s http://localhost:8080/health
```

## Step 7: Configure DNS (Ingress)

Once ingress is deployed, get the ALB endpoint:

```bash
# Get ALB DNS name
kubectl get ingress -n a1-staging -o wide

# Example output:
# NAME              CLASS   HOSTS                             ADDRESS                    PORTS   AGE
# api-gateway       alb     api.staging.a1-internal           k8s-a1staging-abc123-xyz   80      5m
```

Add to your DNS provider (Route 53, etc.):

```
api.staging.a1-agent-engine.internal  →  k8s-a1staging-abc123-xyz (ALB DNS)
studio.staging.a1-agent-engine.internal  →  (same ALB)
dashboard.staging.a1-agent-engine.internal  →  (same ALB)
```

Or add to `/etc/hosts` for local testing:

```
1.2.3.4  api.staging.a1-agent-engine.internal
```

## Step 8: Test Connectivity

```bash
# Test API Gateway
curl -v http://api.staging.a1-agent-engine.internal/health

# Test Agent Studio
curl http://studio.staging.a1-agent-engine.internal/

# Test Dashboard
curl http://dashboard.staging.a1-agent-engine.internal/
```

## Production Deployment

Repeat the same steps with `a1-production` namespace and `infra/k8s/envs/production/` overlays:

```bash
# Create namespace
kubectl create namespace a1-production

# Create secrets (from AWS Secrets Manager via ESO)
kubectl apply -f external-secret-production.yaml

# Build dependencies
helm dependency build infra/k8s/charts/api-gateway/

# Deploy all services
for svc in tool-registry skill-catalog sub-agent-registry agent-registry \
           workflow-initiator skill-dispatcher api-gateway \
           sandbox-manager llm-gateway agent-workers agent-studio dashboard; do
  helm upgrade --install "$svc" \
    "infra/k8s/charts/$svc/" \
    --namespace a1-production \
    -f "infra/k8s/envs/production/$svc.yaml" \
    --set "image.tag=v1.2.3" \
    --wait --timeout 5m
done

# Verify
kubectl get pods -n a1-production
```

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod <pod-name> -n a1-staging
kubectl logs <pod-name> -n a1-staging
```

### Secrets not found

```bash
# Verify secret exists
kubectl get secret postgres-credentials -n a1-staging

# If missing, create it
kubectl create secret generic postgres-credentials -n a1-staging \
  --from-literal=url='postgresql://...'
```

### Dependency build failed

```bash
# Re-build and check for Chart.lock
rm infra/k8s/charts/*/Chart.lock
helm dependency build infra/k8s/charts/api-gateway/

# If error persists, check Chart.yaml dependencies
cat infra/k8s/charts/api-gateway/Chart.yaml
```

### Image pull errors

```bash
# Verify ECR image exists
aws ecr describe-images --repository-name a1/api-gateway

# Verify pod has IRSA permissions
kubectl describe pod <pod-name> -n a1-staging | grep -i role
```

## Next Steps

1. **Configure monitoring** — Add Prometheus, Grafana, CloudWatch
2. **Set up CI/CD** — GitHub Actions, GitLab CI, etc.
3. **Implement secret rotation** — Automate secret updates
4. **Enable autoscaling** — Configure KEDA for agent-workers
5. **Backup & disaster recovery** — Velero or cloud-native backups
