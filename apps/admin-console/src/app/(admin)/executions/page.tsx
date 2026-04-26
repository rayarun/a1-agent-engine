"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Filter } from "lucide-react";

export default function ExecutionsPage() {
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [selectedTenant, setSelectedTenant] = useState("all");
  const [searchAgent, setSearchAgent] = useState("");

  const tenants = [
    { id: "all", name: "All Tenants" },
    { id: "default-tenant", name: "Default Tenant" },
    { id: "acme-corp", name: "ACME Corp" },
  ];

  const executions = [
    {
      session_id: "exec-001",
      tenant_id: "default-tenant",
      agent_id: "manifest-assistant",
      status: "COMPLETED",
      start_time: "2026-04-26T14:32:00Z",
      duration: 5240,
      event_count: 12,
    },
    {
      session_id: "exec-002",
      tenant_id: "acme-corp",
      agent_id: "customer-support-bot",
      status: "RUNNING",
      start_time: "2026-04-26T14:35:00Z",
      duration: 2100,
      event_count: 7,
    },
    {
      session_id: "exec-003",
      tenant_id: "default-tenant",
      agent_id: "data-processor",
      status: "FAILED",
      start_time: "2026-04-26T13:20:00Z",
      duration: 1200,
      event_count: 4,
    },
    {
      session_id: "exec-004",
      tenant_id: "acme-corp",
      agent_id: "report-generator",
      status: "COMPLETED",
      start_time: "2026-04-26T13:10:00Z",
      duration: 8500,
      event_count: 20,
    },
  ];

  const filteredExecutions = executions.filter((exec) => {
    if (selectedTenant !== "all" && exec.tenant_id !== selectedTenant) return false;
    if (filterStatus !== "ALL" && exec.status !== filterStatus) return false;
    if (searchAgent && !exec.agent_id.includes(searchAgent)) return false;
    return true;
  });

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Executions</h1>
        <p className="text-muted-foreground mt-1">
          Cross-tenant execution trace viewer and debugger
        </p>
      </div>

      {/* Tenant Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-4 overflow-x-auto">
          {tenants.map((tenant) => (
            <button
              key={tenant.id}
              onClick={() => setSelectedTenant(tenant.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                selectedTenant === tenant.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tenant.name}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-2">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-2 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="ALL">All Statuses</option>
              <option value="RUNNING">Running</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2">Agent ID</label>
            <input
              type="text"
              value={searchAgent}
              onChange={(e) => setSearchAgent(e.target.value)}
              placeholder="Search agent..."
              className="w-full px-2 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-2">Date Range</label>
            <select className="w-full px-2 py-1.5 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option>Last 24h</option>
              <option>Last 7 days</option>
              <option>Last 30 days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Executions Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Session ID</th>
                <th className="text-left py-3 px-4 font-medium">Tenant</th>
                <th className="text-left py-3 px-4 font-medium">Agent ID</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Started</th>
                <th className="text-left py-3 px-4 font-medium">Duration</th>
                <th className="text-right py-3 px-4 font-medium">Events</th>
                <th className="text-right py-3 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredExecutions.map((exec) => (
                <tr key={exec.session_id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs">{exec.session_id}</td>
                  <td className="py-3 px-4 text-sm">{exec.tenant_id}</td>
                  <td className="py-3 px-4 text-sm">{exec.agent_id}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        exec.status === "COMPLETED"
                          ? "bg-green-500/15 text-green-400"
                          : exec.status === "RUNNING"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-red-500/15 text-red-400"
                      }`}
                    >
                      {exec.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {new Date(exec.start_time).toLocaleTimeString()}
                  </td>
                  <td className="py-3 px-4 text-sm">{formatDuration(exec.duration)}</td>
                  <td className="py-3 px-4 text-right text-sm">{exec.event_count}</td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/executions/${exec.session_id}`}
                      className="flex items-center justify-end text-muted-foreground hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredExecutions.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No executions found matching filters
          </div>
        )}
      </div>
    </div>
  );
}
