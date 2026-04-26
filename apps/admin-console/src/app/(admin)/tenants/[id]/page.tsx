"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "next/navigation";
import { adminApi } from "@/lib/api";
import { Loader2, AlertCircle } from "lucide-react";

type Tab = "overview" | "agents" | "cost" | "models" | "audit";

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [isEditingQuota, setIsEditingQuota] = useState(false);
  const [quotaForm, setQuotaForm] = useState({
    max_concurrent_workflows: 0,
    token_budget_monthly: 0,
  });

  const { data: tenant, isLoading, isError, error } = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => adminApi.getTenant(tenantId),
  });

  const updateQuotaMutation = useMutation({
    mutationFn: async (data: {
      max_concurrent_workflows?: number;
      token_budget_monthly?: number;
    }) => {
      return adminApi.updateTenantQuota(tenantId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
      setIsEditingQuota(false);
    },
  });

  function handleEditQuota() {
    if (tenant) {
      setQuotaForm({
        max_concurrent_workflows: tenant.max_concurrent_workflows,
        token_budget_monthly: tenant.token_budget_monthly,
      });
      setIsEditingQuota(true);
    }
  }

  function handleSaveQuota() {
    updateQuotaMutation.mutate({
      max_concurrent_workflows: quotaForm.max_concurrent_workflows,
      token_budget_monthly: quotaForm.token_budget_monthly,
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "agents", label: "Agents" },
    { id: "cost", label: "Cost" },
    { id: "models", label: "Model Access" },
    { id: "audit", label: "Audit" },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
        <AlertCircle className="h-4 w-4" />
        <span>{error instanceof Error ? error.message : "Failed to load tenant"}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{tenant.display_name}</h1>
        <p className="text-muted-foreground mt-1 font-mono text-sm">{tenant.tenant_id}</p>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border">
        <div className="flex gap-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && (
          <div className="space-y-6">
            {/* Status & Created */}
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Basic Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      tenant.status === "active"
                        ? "bg-green-500/15 text-green-400"
                        : "bg-orange-500/15 text-orange-400"
                    }`}
                  >
                    {tenant.status}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Created</p>
                  <p className="text-sm font-mono">
                    {tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : "N/A"}
                  </p>
                </div>
              </div>
            </div>

            {/* Quota Settings */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Quota Settings</h2>
                {!isEditingQuota && (
                  <button
                    onClick={handleEditQuota}
                    className="px-3 py-1 rounded text-xs bg-muted hover:bg-muted/80"
                  >
                    Edit
                  </button>
                )}
              </div>

              {isEditingQuota ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Max Concurrent Workflows
                    </label>
                    <input
                      type="number"
                      value={quotaForm.max_concurrent_workflows}
                      onChange={(e) =>
                        setQuotaForm({
                          ...quotaForm,
                          max_concurrent_workflows: parseInt(e.target.value),
                        })
                      }
                      min="1"
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Monthly Token Budget (millions)
                    </label>
                    <input
                      type="number"
                      value={quotaForm.token_budget_monthly / 1000000}
                      onChange={(e) =>
                        setQuotaForm({
                          ...quotaForm,
                          token_budget_monthly: parseInt(e.target.value) * 1000000,
                        })
                      }
                      min="1"
                      className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  {updateQuotaMutation.isError && (
                    <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                      <AlertCircle className="h-4 w-4" />
                      <span>
                        {updateQuotaMutation.error instanceof Error
                          ? updateQuotaMutation.error.message
                          : "Failed to update quota"}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveQuota}
                      disabled={updateQuotaMutation.isPending}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                    >
                      {updateQuotaMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      )}
                      Save
                    </button>
                    <button
                      onClick={() => setIsEditingQuota(false)}
                      className="px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Max Concurrent Workflows
                    </p>
                    <p className="text-lg font-semibold">{tenant.max_concurrent_workflows}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      Monthly Token Budget
                    </p>
                    <p className="text-lg font-semibold">
                      {(tenant.token_budget_monthly / 1000000).toFixed(1)}M
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "agents" && (
          <div className="bg-card border border-border rounded-lg p-6 text-center py-12">
            <p className="text-muted-foreground">Agents list coming soon...</p>
          </div>
        )}

        {activeTab === "cost" && (
          <div className="bg-card border border-border rounded-lg p-6 text-center py-12">
            <p className="text-muted-foreground">Cost breakdown coming soon...</p>
          </div>
        )}

        {activeTab === "models" && (
          <div className="bg-card border border-border rounded-lg p-6 text-center py-12">
            <p className="text-muted-foreground">Model access control coming soon...</p>
          </div>
        )}

        {activeTab === "audit" && (
          <div className="bg-card border border-border rounded-lg p-6 text-center py-12">
            <p className="text-muted-foreground">Audit log coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
}
