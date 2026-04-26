# Deployment Workflows

Quick reference for common deployment tasks.

## Prerequisites

Ensure these are in place before deploying:

1. **EKS Cluster** — Running, accessible via `kubectl`
2. **Namespaces** — `a1-staging` and `a1-production` exist
3. **Secrets** — Provisioned in each namespace:
   ```bash
   # For each namespace
   kubectl create secret generic postgres-credentials -n a1-staging \
     --from-literal=url='postgresql://...'
   
   kubectl create secret generic llm-gateway-secrets -n a1-staging \
     --from-literal=openai-api-key='sk-...' \
     --from-literal=anthropic-api-key='sk-ant-...'
   ```
4. **ECR Repositories** — One per service (or shared)
5. **Node Labels** — For sandbox-manager:
   ```bash
   kubectl label nodes <node> a1/sandbox=true
   ```

## Deploy Single Service

```bash
SERVICE=api-gateway
ENV=staging
TAG=abc1234  # git SHA

helm upgrade --install $SERVICE \
  infra/k8s/charts/$SERVICE/ \
  --namespace a1-$ENV \
  -f infra/k8s/envs/$ENV/$SERVICE.yaml \
  --set image.tag=$TAG \
  --atomic --timeout 5m
```

## Deploy All Services

```bash
#!/bin/bash
set -e

ENV=${1:-staging}
TAG=${2:-latest}

SERVICES=(
  api-gateway workflow-initiator sandbox-manager llm-gateway
  sub-agent-registry skill-dispatcher tool-registry skill-catalog
  agent-registry agent-workers agent-studio dashboard
)

for svc in "${SERVICES[@]}"; do
  echo "Deploying $svc to $ENV..."
  helm upgrade --install "$svc" \
    "infra/k8s/charts/$svc/" \
    --namespace "a1-$ENV" \
    -f "infra/k8s/envs/$ENV/$svc.yaml" \
    --set "image.tag=$TAG" \
    --atomic --timeout 5m || {
      echo "Failed to deploy $svc"
      exit 1
    }
done

echo "✓ All services deployed to $ENV"
```

Usage:
```bash
./deploy-all.sh staging abc1234
./deploy-all.sh production v1.2.3
```

## Canary Deployment (One Service)

Deploy to staging first, then production:

```bash
# Staging
helm upgrade --install api-gateway infra/k8s/charts/api-gateway/ \
  --namespace a1-staging \
  -f infra/k8s/envs/staging/api-gateway.yaml \
  --set image.tag=$TAG

# Wait, test, verify in staging

# Production
helm upgrade --install api-gateway infra/k8s/charts/api-gateway/ \
  --namespace a1-production \
  -f infra/k8s/envs/production/api-gateway.yaml \
  --set image.tag=$TAG
```

## Blue-Green Deployment (All Services)

Deploy new version alongside old, then switch traffic:

```bash
# Deploy new version to separate release
helm upgrade --install api-gateway-v2 infra/k8s/charts/api-gateway/ \
  --namespace a1-production \
  -f infra/k8s/envs/production/api-gateway.yaml \
  --set image.tag=$NEW_TAG \
  --set service.name=api-gateway-v2

# Test api-gateway-v2

# Update ingress to point to v2
# kubectl patch ingress api-gateway -n a1-production ...

# Delete old release
helm uninstall api-gateway -n a1-production
```

## Rollback

```bash
# View release history
helm history api-gateway -n a1-staging

# Rollback to previous release
helm rollback api-gateway -n a1-staging

# Rollback to specific revision
helm rollback api-gateway 3 -n a1-staging
```

## Modify Configuration (Without Redeploy)

Update ConfigMap directly:

```bash
kubectl patch configmap api-gateway-config -n a1-staging \
  -p '{"data":{"LOG_LEVEL":"info"}}'
```

**Note:** Pod will need to be restarted to pick up changes. Instead, always redeploy with `helm upgrade` to version control the config.

## Scale Manually

```bash
# Scale deployment to N replicas
kubectl scale deployment api-gateway -n a1-staging --replicas=3

# Check HPA status
kubectl get hpa api-gateway -n a1-staging
kubectl describe hpa api-gateway -n a1-staging
```

## Monitor Deployment

```bash
# Watch rollout progress
kubectl rollout status deployment/api-gateway -n a1-staging -w

# View recent events
kubectl get events -n a1-staging --sort-by='.lastTimestamp' | tail -20

# Get pod logs
kubectl logs -f deployment/api-gateway -n a1-staging --all-containers=true
```

## Update Image Tag Only (Without Chart Changes)

```bash
# Quick update without re-merging values
helm upgrade api-gateway infra/k8s/charts/api-gateway/ \
  --reuse-values \
  --set image.tag=$NEW_TAG \
  --namespace a1-staging
```

## Diff Before Deploying

```bash
helm diff upgrade api-gateway infra/k8s/charts/api-gateway/ \
  --namespace a1-staging \
  -f infra/k8s/envs/staging/api-gateway.yaml \
  --set image.tag=$TAG
```

(Requires `helm-diff` plugin: `helm plugin install https://github.com/databus23/helm-diff`)

## Emergency Rollback

If production is broken and you need immediate rollback:

```bash
# Rollback IMMEDIATELY (without questions)
helm rollback api-gateway 0 -n a1-production --force
kubectl rollout restart deployment/api-gateway -n a1-production
```

## Cleanup (Delete Release)

```bash
helm uninstall api-gateway -n a1-staging
# or delete entire namespace
kubectl delete namespace a1-staging
```

## Secret Management

### Update Secret

```bash
kubectl create secret generic llm-gateway-secrets -n a1-staging \
  --from-literal=openai-api-key='sk-new-key' \
  --dry-run=client -o yaml | kubectl apply -f -

# Force pod restart to pick up new secret
kubectl rollout restart deployment/llm-gateway -n a1-staging
```

### View Secret (Careful!)

```bash
kubectl get secret postgres-credentials -n a1-staging -o jsonpath='{.data.url}' | base64 -d
```

## CI/CD Integration (GitHub Actions)

```yaml
name: Deploy to Staging

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          role-to-assume: arn:aws:iam::ACCOUNT:role/GitHubActionsRole
          aws-region: us-east-1
      
      - name: Login to ECR
        run: aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
      
      - name: Build image
        run: |
          docker build -t $ECR_REGISTRY/a1/api-gateway:${{ github.sha }} \
            -f services/api-gateway/Dockerfile .
          docker push $ECR_REGISTRY/a1/api-gateway:${{ github.sha }}
      
      - name: Deploy with Helm
        run: |
          aws eks update-kubeconfig --name a1-staging-eks
          helm upgrade --install api-gateway \
            infra/k8s/charts/api-gateway/ \
            --namespace a1-staging \
            -f infra/k8s/envs/staging/api-gateway.yaml \
            --set image.tag=${{ github.sha }} \
            --atomic --timeout 5m
```

## Validation Script

```bash
#!/bin/bash
# Verify all services are deployed and healthy

NAMESPACE=a1-staging

echo "Checking deployments in $NAMESPACE..."
kubectl get deployments -n $NAMESPACE

echo "Checking pod status..."
kubectl get pods -n $NAMESPACE

echo "Checking services..."
kubectl get services -n $NAMESPACE

echo "Checking ingress..."
kubectl get ingress -n $NAMESPACE

echo "Health checks (sample)..."
for svc in api-gateway workflow-initiator llm-gateway; do
  echo -n "$svc: "
  kubectl exec -it -n $NAMESPACE deployment/$svc -- \
    curl -s http://localhost:8080/health 2>/dev/null || echo "FAIL"
done
```

## Common Issues

### Pod CrashLoopBackOff
```bash
kubectl describe pod <pod-name> -n a1-staging
kubectl logs <pod-name> -n a1-staging
```

### Pending Ingress
```bash
# Check if ALB controller is running
kubectl get pods -n kube-system | grep alb

# Check ingress status
kubectl describe ingress api-gateway -n a1-staging
```

### Image Pull Errors
```bash
# Verify ECR permissions (IRSA)
kubectl describe pod <pod-name> -n a1-staging | grep Events

# Check image exists
aws ecr describe-images --repository-name a1/api-gateway
```
