"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, Download } from "lucide-react";
import { adminApi } from "@/lib/api";

export default function AuditPage() {
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [resourceType, setResourceType] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");

  const { data: auditData, isLoading, isError, error } = useQuery({
    queryKey: ["audit", limit, offset, resourceType, tenantId],
    queryFn: () =>
      adminApi.getAuditLog({
        limit,
        offset,
        resource_type: resourceType || undefined,
        tenant_id: tenantId || undefined,
      }),
  });

  const events = auditData?.events || [];

  function formatDate(date: string): string {
    return new Date(date).toLocaleString();
  }

  const stateColors: Record<string, string> = {
    draft: "bg-gray-500/15 text-gray-400",
    staged: "bg-blue-500/15 text-blue-400",
    active: "bg-green-500/15 text-green-400",
    approved: "bg-green-500/15 text-green-400",
    rejected: "bg-red-500/15 text-red-400",
    suspended: "bg-orange-500/15 text-orange-400",
    deleted: "bg-red-500/15 text-red-400",
  };

  function getStateColor(state: string | null | undefined): string {
    if (!state) return "bg-gray-500/15 text-gray-400";
    const lower = state.toLowerCase();
    return stateColors[lower] || "bg-gray-500/15 text-gray-400";
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground mt-1">
          Immutable lifecycle events for all resources and actions
        </p>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Resource Type</label>
            <select
              value={resourceType}
              onChange={(e) => {
                setResourceType(e.target.value);
                setOffset(0);
              }}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Types</option>
              <option value="agent">Agent</option>
              <option value="skill">Skill</option>
              <option value="tool">Tool</option>
              <option value="sub_agent">Sub-Agent</option>
              <option value="team">Team</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Tenant ID</label>
            <input
              type="text"
              value={tenantId}
              onChange={(e) => {
                setTenantId(e.target.value);
                setOffset(0);
              }}
              placeholder="Filter by tenant..."
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Results Per Page</label>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value));
                setOffset(0);
              }}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={250}>250</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button className="flex items-center gap-2 px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80">
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span>{error instanceof Error ? error.message : "Failed to load audit log"}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Events Table */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            {events.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/50">
                    <tr>
                      <th className="text-left py-3 px-4 font-medium">Timestamp</th>
                      <th className="text-left py-3 px-4 font-medium">Resource</th>
                      <th className="text-left py-3 px-4 font-medium">Tenant</th>
                      <th className="text-left py-3 px-4 font-medium">From → To</th>
                      <th className="text-left py-3 px-4 font-medium">Actor</th>
                      <th className="text-left py-3 px-4 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event: any) => (
                      <tr key={event.id} className="border-b border-border hover:bg-muted/30">
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(event.created_at)}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">
                          <span className="text-xs bg-muted/50 px-2 py-1 rounded">
                            {event.resource_type}
                          </span>
                          <br />
                          <span className="text-muted-foreground">{event.resource_id}</span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs">{event.tenant_id}</td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStateColor(
                                event.from_state
                              )}`}
                            >
                              {event.from_state || "—"}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span
                              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getStateColor(
                                event.to_state
                              )}`}
                            >
                              {event.to_state}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">{event.actor}</td>
                        <td className="py-3 px-4 text-xs text-muted-foreground max-w-xs truncate">
                          {event.reason || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground">
                No audit events found
              </div>
            )}
          </div>

          {/* Pagination */}
          {events.length > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Showing {offset + 1} to {Math.min(offset + limit, offset + events.length)} of {limit}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={events.length < limit}
                  className="px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
