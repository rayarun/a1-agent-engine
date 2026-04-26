# Troubleshooting Guide

## Common Issues & Solutions

### Pod stuck in `ImagePullBackOff`

**Symptoms:** Pod cannot pull image from ECR

**Diagnosis:**
```bash
kubectl describe pod <pod-name> -n a1-staging
# Look for "Failed to pull image" in Events
```

**Solutions:**
1. **Verify ECR image exists:**
   ```bash
   aws ecr describe-images --repository-name a1/api-gateway
   ```

2. **Verify IAM permissions (IRSA):**
   ```bash
   # Check pod's service account annotation
   kubectl get sa -n a1-staging
   kubectl describe sa default -n a1-staging
   
   # Verify IRSA role is configured
   kubectl get pods <pod-name> -n a1-staging -o jsonpath='{.spec.serviceAccountName}'
   ```

3. **Check image tag is correct:**
   ```bash
   kubectl get deployment api-gateway -n a1-staging -o jsonpath='{.spec.template.spec.containers[0].image}'
   ```

### Pod stuck in `Pending`

**Symptoms:** Pod not scheduling (no Running pods)

**Diagnosis:**
```bash
kubectl describe pod <pod-name> -n a1-staging
# Look for "Warning" events like "0 nodes available"
```

**Solutions:**
1. **Insufficient resources:**
   ```bash
   kubectl describe nodes
   # Look for Allocatable resources
   
   # Reduce resource requests in values.yaml:
   resources:
     requests:
       cpu: "25m"  # Decrease
       memory: "32Mi"  # Decrease
   ```

2. **Node selectors not matching:**
   ```bash
   # For sandbox-manager (DaemonSet)
   kubectl label nodes <node> a1/sandbox=true
   kubectl get nodes --show-labels
   ```

3. **Taints/Tolerations mismatch:**
   ```bash
   kubectl describe nodes | grep Taints
   # Ensure chart values.yaml has matching tolerations
   ```

### Pod in `CrashLoopBackOff`

**Symptoms:** Pod starts then immediately crashes

**Diagnosis:**
```bash
# Check logs for error
kubectl logs <pod-name> -n a1-staging

# Get previous log (if available)
kubectl logs <pod-name> -n a1-staging --previous

# Describe pod for more details
kubectl describe pod <pod-name> -n a1-staging
```

**Common causes & fixes:**
- **Database connection error:**
  ```bash
  # Verify SECRET exists
  kubectl get secret postgres-credentials -n a1-staging -o jsonpath='{.data.url}' | base64 -d
  
  # Test connection from pod
  kubectl exec -it <pod-name> -n a1-staging -- psql $DATABASE_URL
  ```

- **Missing environment variable:**
  ```bash
  # Check ConfigMap was created
  kubectl get configmap <release>-config -n a1-staging
  kubectl describe configmap <release>-config -n a1-staging
  ```

- **Port already in use:**
  ```bash
  # Check if another pod on same node uses port
  kubectl get pods -n a1-staging -o wide
  ```

- **Incorrect Temporal hostport:**
  ```bash
  # Verify from pod
  kubectl exec -it <pod-name> -n a1-staging -- nslookup temporal.staging.internal
  kubectl exec -it <pod-name> -n a1-staging -- curl temporal.staging.internal:7233
  ```

### Service DNS not resolving

**Symptoms:** Pod cannot reach service by name (e.g., `http://api-gateway:8080`)

**Diagnosis:**
```bash
# From pod, test DNS
kubectl exec -it <pod-name> -n a1-staging -- nslookup api-gateway
kubectl exec -it <pod-name> -n a1-staging -- nslookup api-gateway.a1-staging.svc.cluster.local
```

**Solutions:**
1. **Service not created:**
   ```bash
   kubectl get services -n a1-staging
   # If missing, check values.yaml: service.enabled: true
   ```

2. **Cross-namespace service call:**
   ```bash
   # Use FQDN instead of short name:
   http://api-gateway.a1-staging.svc.cluster.local:8080
   
   # Or use service IP directly:
   kubectl get svc api-gateway -n a1-staging -o jsonpath='{.spec.clusterIP}'
   ```

3. **CoreDNS not working:**
   ```bash
   kubectl get pods -n kube-system -l k8s-app=kube-dns
   kubectl logs -n kube-system -l k8s-app=kube-dns
   ```

### Ingress not routing traffic

**Symptoms:** Ingress created but requests fail

**Diagnosis:**
```bash
# Check ingress created
kubectl get ingress -n a1-staging

# Describe for details
kubectl describe ingress api-gateway -n a1-staging

# Check ALB controller
kubectl get pods -n kube-system | grep alb
kubectl logs -n kube-system -l app.kubernetes.io/name=aws-load-balancer-controller
```

**Solutions:**
1. **ALB controller not installed:**
   ```bash
   # Install AWS Load Balancer Controller
   # See: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html
   ```

2. **Incorrect ingress annotations:**
   ```bash
   # Check annotations in values.yaml match ALB controller expectations
   # Example:
   alb.ingress.kubernetes.io/scheme: internet-facing
   alb.ingress.kubernetes.io/target-type: ip
   ```

3. **Certificate not found:**
   ```bash
   # Verify ACM certificate exists
   aws acm describe-certificate --certificate-arn arn:aws:acm:...
   ```

4. **Backend service not ready:**
   ```bash
   # Check service exists and has endpoints
   kubectl get endpoints api-gateway -n a1-staging
   
   # If no endpoints, pods aren't ready
   kubectl get pods -n a1-staging
   ```

### HPA not scaling

**Symptoms:** Pods not autoscaling when traffic increases

**Diagnosis:**
```bash
# Check HPA status
kubectl get hpa -n a1-staging
kubectl describe hpa api-gateway -n a1-staging

# Check metrics available
kubectl get --raw /apis/custom.metrics.k8s.io/v1beta1
```

**Solutions:**
1. **Metrics server not installed:**
   ```bash
   kubectl get pods -n kube-system | grep metrics-server
   
   # If missing, install:
   kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.6.2/components.yaml
   ```

2. **Metrics not available yet (wait):**
   - Takes ~1-2 minutes for metrics to become available
   - Check again: `kubectl get hpa -n a1-staging -w`

3. **Resource requests not set:**
   - HPA uses CPU/memory requests as baseline
   - Ensure `resources.requests` is set in values.yaml

4. **Threshold not reached:**
   - Check current vs target:
   ```bash
   kubectl get hpa api-gateway -n a1-staging --watch
   ```

### High Memory Usage

**Symptoms:** Pod OOMKilled or using more memory than expected

**Diagnosis:**
```bash
# Check memory usage
kubectl top pods -n a1-staging

# Check resource limits
kubectl get pods <pod-name> -n a1-staging -o jsonpath='{.spec.containers[0].resources.limits.memory}'

# View recent OOM events
kubectl describe pod <pod-name> -n a1-staging | grep -i oom
```

**Solutions:**
1. **Increase memory limit:**
   ```yaml
   resources:
     limits:
       memory: "1Gi"  # Increase from current
   ```

2. **Investigate memory leak:**
   - Check application logs for errors
   - Profile memory usage in development

3. **Configure memory requests properly:**
   ```yaml
   resources:
     requests:
       memory: "256Mi"  # Should be ~80% of limit
     limits:
       memory: "512Mi"
   ```

### Database Migrations Not Running

**Symptoms:** Schema not initialized, queries fail with table not found

**Diagnosis:**
- In Docker Compose, `migrate` service runs before others
- In Kubernetes, you must manage migrations separately

**Solutions:**
1. **One-time setup:**
   ```bash
   # Run migrations manually before deploying services
   kubectl run migration \
     --image=postgresql:14 \
     --rm -it \
     -- psql $DATABASE_URL < infra/postgres/migrate.sh
   ```

2. **Automated (via Job):**
   ```yaml
   # Create infra/k8s/jobs/migrate.yaml
   apiVersion: batch/v1
   kind: Job
   metadata:
     name: db-migrate
   spec:
     template:
       spec:
         containers:
         - name: migrate
           image: postgresql:14
           env:
           - name: PGPASSWORD
             valueFrom:
               secretKeyRef:
                 name: postgres-credentials
                 key: password
           command: ["psql", "-h", "$(DB_HOST)", "-U", "postgres", "-f", "/migrations/migrate.sql"]
         restartPolicy: Never
   ```

### Temporal Connection Errors

**Symptoms:** Agent-workers failing to connect to Temporal

**Diagnosis:**
```bash
kubectl logs -l app=agent-workers -n a1-staging | grep -i temporal

# Test connection from pod
kubectl exec -it deployment/agent-workers -n a1-staging -- \
  python -c "from temporalio.client import Client; import asyncio; asyncio.run(Client.connect('temporal.staging.internal:7233'))"
```

**Solutions:**
1. **Wrong Temporal hostport in config:**
   ```yaml
   config:
     TEMPORAL_HOSTPORT: "temporal.staging.internal:7233"  # Verify this
   ```

2. **Temporal service not accessible:**
   ```bash
   # From pod, test connectivity
   kubectl exec -it <pod-name> -n a1-staging -- nc -zv temporal.staging.internal 7233
   ```

3. **Network policy blocking traffic:**
   ```bash
   kubectl get networkpolicies -n a1-staging
   # Ensure traffic to Temporal is allowed
   ```

### Certificate Errors in HTTPS

**Symptoms:** SSL certificate errors, HTTPS requests fail

**Diagnosis:**
```bash
# Check ingress certificate
kubectl get ingress -n a1-staging -o jsonpath='{.spec.tls[0].secretName}'

# Verify certificate secret exists
kubectl get secret <cert-secret> -n a1-staging

# Check certificate details
kubectl describe secret <cert-secret> -n a1-staging
```

**Solutions:**
1. **Certificate not found in namespace:**
   ```bash
   # Create it from ACM
   # Or use cert-manager to auto-provision
   kubectl apply -f cert-manager-issuer.yaml
   ```

2. **Certificate expired:**
   ```bash
   # Update certificate ARN in ingress annotations
   alb.ingress.kubernetes.io/certificate-arn: arn:aws:acm:...
   ```

## Debug Commands Cheat Sheet

```bash
# General status
kubectl get all -n a1-staging

# Detailed pod info
kubectl describe pod <pod-name> -n a1-staging

# View logs
kubectl logs deployment/api-gateway -n a1-staging
kubectl logs deployment/api-gateway -n a1-staging -f  # Follow
kubectl logs deployment/api-gateway -n a1-staging --previous  # Previous run

# Execute command in pod
kubectl exec -it deployment/api-gateway -n a1-staging -- /bin/sh

# Port forwarding
kubectl port-forward svc/api-gateway 8080:8080 -n a1-staging

# Check events (recent issues)
kubectl get events -n a1-staging --sort-by='.lastTimestamp'

# Check resource usage
kubectl top pods -n a1-staging
kubectl top nodes

# Helm debugging
helm template api-gateway infra/k8s/charts/api-gateway/ \
  -f infra/k8s/envs/staging/api-gateway.yaml \
  --set image.tag=abc1234 | less

helm get values api-gateway -n a1-staging
helm get manifest api-gateway -n a1-staging

# Rollout status
kubectl rollout status deployment/api-gateway -n a1-staging -w
kubectl rollout history deployment/api-gateway -n a1-staging
```

## Getting Help

**Check the full logs:**
```bash
kubectl describe pod <pod-name> -n a1-staging | head -50
kubectl logs <pod-name> -n a1-staging | tail -100
```

**Review Helm values applied:**
```bash
helm get values <release> -n a1-staging
```

**Inspect generated manifests:**
```bash
kubectl get deployment api-gateway -n a1-staging -o yaml
```

**Check if service is reachable:**
```bash
# From another pod in same namespace
kubectl run debug --image=alpine -it --rm -- \
  wget -O- http://api-gateway:8080/health
```
