"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { Loader2, AlertCircle, Plus, ChevronRight } from "lucide-react";

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    tenant_id: "",
    display_name: "",
    max_concurrent_workflows: 50,
    token_budget_monthly: 10000000,
  });

  const { data: tenantsData, isLoading, isError, error } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => adminApi.listTenants(),
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: any) => {
      const result = await adminApi.createTenant(data);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      setIsCreateOpen(false);
      setCreateForm({
        tenant_id: "",
        display_name: "",
        max_concurrent_workflows: 50,
        token_budget_monthly: 10000000,
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ tenantId, status }: { tenantId: string; status: "active" | "suspended" }) => {
      const result = await adminApi.updateTenantStatus(tenantId, status);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
  });

  function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    createTenantMutation.mutate(createForm);
  }

  function handleSuspend(tenantId: string) {
    if (confirm(`Suspend tenant ${tenantId}?`)) {
      statusMutation.mutate({ tenantId, status: "suspended" });
    }
  }

  function handleActivate(tenantId: string) {
    statusMutation.mutate({ tenantId, status: "active" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tenants</h1>
          <p className="text-muted-foreground mt-1">Manage platform tenants and their configurations</p>
        </div>
        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Create Tenant
        </button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span>{error instanceof Error ? error.message : "Failed to load tenants"}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tenantsData?.tenants && tenantsData.tenants.length > 0 ? (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Tenant ID</th>
                  <th className="text-left py-3 px-4 font-medium">Display Name</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-right py-3 px-4 font-medium">Max Workflows</th>
                  <th className="text-right py-3 px-4 font-medium">Token Budget</th>
                  <th className="text-right py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tenantsData.tenants.map((tenant: any) => (
                  <tr key={tenant.tenant_id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs">{tenant.tenant_id}</td>
                    <td className="py-3 px-4">{tenant.display_name}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          tenant.status === "active"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">{tenant.max_concurrent_workflows}</td>
                    <td className="py-3 px-4 text-right">
                      {(tenant.token_budget_monthly / 1000000).toFixed(1)}M
                    </td>
                    <td className="py-3 px-4 text-right flex items-center justify-end gap-2">
                      <Link
                        href={`/tenants/${tenant.tenant_id}`}
                        className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted"
                      >
                        View
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                      {tenant.status === "active" ? (
                        <button
                          onClick={() => handleSuspend(tenant.tenant_id)}
                          disabled={statusMutation.isPending}
                          className="px-2 py-1 rounded text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          onClick={() => handleActivate(tenant.tenant_id)}
                          disabled={statusMutation.isPending}
                          className="px-2 py-1 rounded text-xs text-green-400 hover:bg-green-500/10 disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <p className="text-muted-foreground mb-4">No tenants configured</p>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create First Tenant
          </button>
        </div>
      )}

      {isCreateOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-lg font-semibold mb-4">Create Tenant</h2>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Tenant ID</label>
                <input
                  type="text"
                  value={createForm.tenant_id}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, tenant_id: e.target.value })
                  }
                  placeholder="e.g., acme-corp"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  disabled={createTenantMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  value={createForm.display_name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, display_name: e.target.value })
                  }
                  placeholder="e.g., ACME Corporation"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                  disabled={createTenantMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Max Concurrent Workflows</label>
                <input
                  type="number"
                  value={createForm.max_concurrent_workflows}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      max_concurrent_workflows: parseInt(e.target.value),
                    })
                  }
                  min="1"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={createTenantMutation.isPending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Monthly Token Budget (millions)
                </label>
                <input
                  type="number"
                  value={createForm.token_budget_monthly / 1000000}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      token_budget_monthly: parseInt(e.target.value) * 1000000,
                    })
                  }
                  min="1"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={createTenantMutation.isPending}
                />
              </div>

              {createTenantMutation.isError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    {createTenantMutation.error instanceof Error
                      ? createTenantMutation.error.message
                      : "Failed to create tenant"}
                  </span>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={createTenantMutation.isPending}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {createTenantMutation.isPending && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={createTenantMutation.isPending}
                  className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
