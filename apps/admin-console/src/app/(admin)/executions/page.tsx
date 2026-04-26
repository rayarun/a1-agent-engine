"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { adminApi } from "@/lib/api";

export default function ExecutionsPage() {
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [searchAgent, setSearchAgent] = useState("");

  const { data: executionsData, isLoading, isError, error } = useQuery({
    queryKey: ["executions", filterStatus, selectedTenant],
    queryFn: () =>
      adminApi.listExecutions({
        status: filterStatus !== "ALL" ? filterStatus : undefined,
        tenant_id: selectedTenant || undefined,
      }),
  });

  const executions = executionsData?.executions || [];

  function formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  function formatTime(date: string): string {
    return new Date(date).toLocaleString();
  }

  const statusColors: Record<string, string> = {
    RUNNING: "bg-blue-500/15 text-blue-400",
    COMPLETED: "bg-green-500/15 text-green-400",
    FAILED: "bg-red-500/15 text-red-400",
    CANCELLED: "bg-gray-500/15 text-gray-400",
  };

  function getStatusColor(status: string): string {
    return statusColors[status] || "bg-gray-500/15 text-gray-400";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Executions</h1>
        <p className="text-muted-foreground mt-1">
          Cross-tenant workflow execution history and real-time traces
        </p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tenant</label>
            <input
              type="text"
              value={selectedTenant}
              onChange={(e) => setSelectedTenant(e.target.value)}
              placeholder="Filter by tenant..."
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Agent ID</label>
            <input
              type="text"
              value={searchAgent}
              onChange={(e) => setSearchAgent(e.target.value)}
              placeholder="Search agent..."
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span>{error instanceof Error ? error.message : "Failed to load executions"}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Executions List */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {executions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium">Session ID</th>
                      <th className="text-left py-3 px-4 font-medium">Tenant</th>
                      <th className="text-left py-3 px-4 font-medium">Agent</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Started</th>
                      <th className="text-center py-3 px-4 font-medium">Duration</th>
                      <th className="text-center py-3 px-4 font-medium">Events</th>
                      <th className="text-center py-3 px-4 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((execution: any) => (
                      <tr key={execution.session_id} className="border-b border-border hover:bg-muted/30">
                        <td className="py-3 px-4 font-mono text-xs">{execution.session_id}</td>
                        <td className="py-3 px-4 text-xs">{execution.tenant_id}</td>
                        <td className="py-3 px-4 text-xs">{execution.agent_id}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStatusColor(
                              execution.status
                            )}`}
                          >
                            {execution.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatTime(execution.start_time)}
                        </td>
                        <td className="py-3 px-4 text-xs text-center">{formatDuration(execution.duration_ms)}</td>
                        <td className="py-3 px-4 text-xs text-center">{execution.event_count}</td>
                        <td className="py-3 px-4 text-center">
                          <Link
                            href={`/executions/${execution.session_id}`}
                            className="text-primary hover:underline"
                          >
                            <ChevronRight className="h-4 w-4 inline" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                <p>No executions found</p>
                <p className="text-xs mt-2">
                  Executions will appear here when agents are invoked. Temporal integration coming in Phase 5.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
