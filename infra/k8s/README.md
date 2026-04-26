# Kubernetes Deployment

This directory contains production-grade Kubernetes manifests for deploying the A1 Agent Engine Admin Plane components (Admin API + Admin Console).

## Quick Start

```bash
# 1. Deploy using Kustomize (recommended)
kubectl apply -k infra/k8s/

# 2. Verify deployment
kubectl get pods -n a1-agent-engine
kubectl get svc -n a1-agent-engine

# 3. Check admin-api health
kubectl port-forward -n a1-agent-engine svc/admin-api 8089:8089 &
curl http://localhost:8089/health

# 4. Access admin console
kubectl port-forward -n a1-agent-engine svc/admin-console 3001:3001 &
# Open http://localhost:3001 in browser
```

## Structure

```
infra/k8s/
├── namespace.yaml                  # a1-agent-engine namespace
├── kustomization.yaml              # Kustomize root config
├── ingress.yaml                    # Ingress for external access
│
├── admin-api/
│   ├── configmap.yaml             # Non-sensitive config
│   ├── secret.yaml                # Sensitive data (ADMIN_API_KEY, DB_URL)
│   ├── deployment.yaml            # Pod deployment, resources, probes
│   ├── service.yaml               # ClusterIP service
│   └── rbac.yaml                  # ServiceAccount + Role + RoleBinding
│
├── admin-console/
│   ├── configmap.yaml             # Frontend config
│   ├── deployment.yaml            # Next.js pod deployment
│   ├── service.yaml               # ClusterIP service
│   └── rbac.yaml                  # ServiceAccount + Role + RoleBinding
│
├── DEPLOYMENT.md                  # Full deployment guide & troubleshooting
└── README.md                       # This file
```

## Key Features

- **Multi-Replica HA**: Both admin-api and admin-console run 2 replicas by default with pod anti-affinity
- **Health Probes**: Liveness and readiness probes configured for both services
- **Resource Limits**: CPU/memory requests and limits defined for efficient cluster scheduling
- **RBAC**: Minimal permissions via ServiceAccounts and Roles (principle of least privilege)
- **Security**: Non-root containers, read-only filesystems, no privilege escalation
- **ConfigMaps & Secrets**: Externalized configuration with optional secret rotation
- **Ingress**: Path/hostname-based routing for external access
- **Kustomize**: Easy overlay-based configuration for dev/staging/prod environments

## Environment Variables

### admin-api

| Variable | Source | Required | Description |
|----------|--------|----------|-------------|
| `ADMIN_API_KEY` | Secret | Yes | Bearer token for API authentication |
| `DATABASE_URL` | Secret | Yes | PostgreSQL connection string |
| `LOG_LEVEL` | ConfigMap | No | Logging level (info, debug, warn) |
| `ADMIN_API_PORT` | ConfigMap | No | Service port (default 8089) |
| `AGENT_REGISTRY_URL` | Env | Yes | http://agent-registry:8088 |
| `WORKFLOW_INITIATOR_URL` | Env | Yes | http://workflow-initiator:8081 |

### admin-console

| Variable | Source | Required | Description |
|----------|--------|----------|-------------|
| `NEXT_PUBLIC_ADMIN_API_URL` | ConfigMap | Yes | Admin API endpoint URL |
| `NODE_ENV` | ConfigMap | No | production (Next.js optimization) |

**Note:** `NEXT_PUBLIC_*` variables are baked into the Next.js bundle at build time. Update the ConfigMap and rebuild the image for environment-specific values.

## Production Considerations

### Secrets Management

**DO NOT commit plaintext secrets to Git.** Use one of:
- **AWS Secrets Manager** + ExternalSecrets operator
- **HashiCorp Vault** + Vault Injector
- **SealedSecrets** operator

See `DEPLOYMENT.md` for detailed instructions.

### High Availability

- Increase replicas to 3+ for production
- Use zone anti-affinity for geographic redundancy
- Configure Pod Disruption Budget for safe updates

## Common Operations

### Deploy to cluster

```bash
kubectl apply -k infra/k8s/
```

### Check deployment status

```bash
kubectl get pods -n a1-agent-engine -o wide
kubectl logs -n a1-agent-engine -l app=admin-api -f
kubectl describe pod <pod-name> -n a1-agent-engine
```

### Scale replicas

```bash
kubectl scale deployment admin-api -n a1-agent-engine --replicas=5
```

### Port-forward for local testing

```bash
kubectl port-forward -n a1-agent-engine svc/admin-api 8089:8089 &
kubectl port-forward -n a1-agent-engine svc/admin-console 3001:3001 &
```

## Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** — Complete deployment guide, secrets, monitoring, troubleshooting
- **[../../README.md](../../README.md)** — Project overview
