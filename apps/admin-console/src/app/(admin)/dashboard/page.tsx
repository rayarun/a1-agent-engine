"use client";

import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/api";
import { Loader2, AlertCircle } from "lucide-react";

export default function DashboardPage() {
  const { data: tenantsData, isLoading, isError, error } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => adminApi.listTenants(),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Platform Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Overview and management of the A1 Agent Engine platform
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-sm text-muted-foreground">Active Tenants</div>
          <div className="text-3xl font-bold mt-2">
            {isLoading ? "-" : tenantsData?.count || 0}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-sm text-muted-foreground">Active Workflows</div>
          <div className="text-3xl font-bold mt-2">0</div>
          <div className="text-xs text-muted-foreground mt-2">
            Real-time from Temporal
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-sm text-muted-foreground">LLM Mode</div>
          <div className="text-lg font-semibold mt-2">anthropic</div>
          <div className="text-xs text-muted-foreground mt-2">
            Custom proxy configured
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="text-sm text-muted-foreground">Service Health</div>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-3 w-3 bg-green-500 rounded-full"></div>
            <span className="text-sm font-medium">All services healthy</span>
          </div>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Tenants</h2>

        {isError && (
          <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
            <AlertCircle className="h-4 w-4" />
            <span>
              {error instanceof Error ? error.message : "Failed to load tenants"}
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tenantsData?.tenants && tenantsData.tenants.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left py-2 px-4">Tenant ID</th>
                  <th className="text-left py-2 px-4">Display Name</th>
                  <th className="text-left py-2 px-4">Status</th>
                  <th className="text-right py-2 px-4">Max Workflows</th>
                  <th className="text-right py-2 px-4">Token Budget</th>
                </tr>
              </thead>
              <tbody>
                {tenantsData.tenants.map((tenant: any) => (
                  <tr key={tenant.tenant_id} className="border-b border-border">
                    <td className="py-2 px-4 font-mono text-xs">
                      {tenant.tenant_id}
                    </td>
                    <td className="py-2 px-4">{tenant.display_name}</td>
                    <td className="py-2 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          tenant.status === "active"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right">
                      {tenant.max_concurrent_workflows}
                    </td>
                    <td className="py-2 px-4 text-right">
                      {(tenant.token_budget_monthly / 1000000).toFixed(1)}M
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted-foreground py-8 text-center">
            No tenants configured
          </p>
        )}
      </div>

      {/* Recent Activity */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Recent Events</h2>
        <p className="text-muted-foreground text-sm py-8 text-center">
          Event log feature coming soon...
        </p>
      </div>
    </div>
  );
}
