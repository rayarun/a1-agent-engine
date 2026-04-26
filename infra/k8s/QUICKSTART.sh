#!/bin/bash
# Quick deployment script for A1 Agent Engine

set -e

# Configuration
ENVIRONMENT=${1:-staging}
IMAGE_TAG=${2:-latest}
NAMESPACE="a1-${ENVIRONMENT}"

if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
  echo "Usage: $0 <staging|production> [image-tag]"
  echo "Example: $0 staging abc1234"
  exit 1
fi

echo "=========================================="
echo "A1 Agent Engine — Helm Deployment"
echo "Environment: $ENVIRONMENT"
echo "Image Tag: $IMAGE_TAG"
echo "Namespace: $NAMESPACE"
echo "=========================================="

# Step 1: Verify prerequisites
echo -e "\n[1/6] Verifying prerequisites..."
command -v helm >/dev/null || { echo "helm not found"; exit 1; }
command -v kubectl >/dev/null || { echo "kubectl not found"; exit 1; }
kubectl cluster-info >/dev/null || { echo "kubectl not configured"; exit 1; }

# Step 2: Create namespace if needed
echo -e "\n[2/6] Ensuring namespace exists..."
kubectl get namespace "$NAMESPACE" >/dev/null || kubectl create namespace "$NAMESPACE"

# Step 3: Verify secrets exist
echo -e "\n[3/6] Checking required secrets..."
SECRETS=(
  postgres-credentials
  llm-gateway-secrets
)

for secret in "${SECRETS[@]}"; do
  if ! kubectl get secret "$secret" -n "$NAMESPACE" >/dev/null 2>&1; then
    echo "⚠️  WARNING: Secret '$secret' not found in namespace '$NAMESPACE'"
    echo "   Create it with: kubectl create secret generic $secret -n $NAMESPACE --from-literal=..."
  fi
done

# Step 4: Build Helm dependencies
echo -e "\n[4/6] Building Helm chart dependencies..."
for chart in infra/k8s/charts/*/; do
  if [ "$(basename "$chart")" != "_lib" ]; then
    helm dependency build "$chart" >/dev/null 2>&1 || true
  fi
done

# Step 5: Deploy services
echo -e "\n[5/6] Deploying services..."

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

FAILED_SERVICES=()

for svc in "${SERVICES[@]}"; do
  echo -n "  → $svc... "
  if helm upgrade --install "$svc" \
    "infra/k8s/charts/$svc/" \
    --namespace "$NAMESPACE" \
    -f "infra/k8s/envs/$ENVIRONMENT/$svc.yaml" \
    --set "image.tag=$IMAGE_TAG" \
    --atomic --timeout 5m >/dev/null 2>&1; then
    echo "✓"
  else
    echo "✗ FAILED"
    FAILED_SERVICES+=("$svc")
  fi
done

# Step 6: Verify deployment
echo -e "\n[6/6] Verifying deployment..."
echo -e "\nDeployments in namespace $NAMESPACE:"
kubectl get deployments -n "$NAMESPACE" -o wide

echo -e "\nServices in namespace $NAMESPACE:"
kubectl get services -n "$NAMESPACE"

echo -e "\nPods in namespace $NAMESPACE:"
kubectl get pods -n "$NAMESPACE"

if [ ${#FAILED_SERVICES[@]} -eq 0 ]; then
  echo -e "\n=========================================="
  echo "✓ All services deployed successfully!"
  echo "=========================================="
  echo ""
  echo "Next steps:"
  echo "  1. Wait for pods to reach Running state:"
  echo "     kubectl get pods -n $NAMESPACE -w"
  echo ""
  echo "  2. Check ingress DNS:"
  echo "     kubectl get ingress -n $NAMESPACE"
  echo ""
  echo "  3. Test API Gateway:"
  echo "     kubectl port-forward svc/api-gateway 8080:8080 -n $NAMESPACE"
  echo "     curl http://localhost:8080/health"
  echo ""
else
  echo -e "\n=========================================="
  echo "⚠️  Some services failed to deploy:"
  for svc in "${FAILED_SERVICES[@]}"; do
    echo "  - $svc"
  done
  echo "=========================================="
  echo ""
  echo "Debug with:"
  echo "  kubectl describe deployment <service> -n $NAMESPACE"
  echo "  kubectl logs deployment/<service> -n $NAMESPACE"
  exit 1
fi
