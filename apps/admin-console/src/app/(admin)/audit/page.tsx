"use client";

import { useState } from "react";
import { Download, Filter } from "lucide-react";

export default function AuditPage() {
  const [filterResourceType, setFilterResourceType] = useState("all");
  const [filterTenant, setFilterTenant] = useState("all");
  const [selectedEvent, setSelectedEvent] = useState<number | null>(null);

  const events = [
    {
      id: 1,
      timestamp: "2026-04-26T14:32:00Z",
      tenant_id: "default-tenant",
      resource_type: "agent",
      resource_id: "manifest-assistant",
      from_state: "draft",
      to_state: "staged",
      actor: "admin@internal",
      details: "Agent transitioned to staging for deployment",
    },
    {
      id: 2,
      timestamp: "2026-04-26T14:10:00Z",
      tenant_id: "acme-corp",
      resource_type: "skill",
      resource_id: "customer-response",
      from_state: "active",
      to_state: "active",
      actor: "dev@acme.com",
      details: "Skill manifest updated with new tool references",
    },
    {
      id: 3,
      timestamp: "2026-04-26T13:55:00Z",
      tenant_id: "default-tenant",
      resource_type: "tool",
      resource_id: "document-retrieval",
      from_state: "pending_review",
      to_state: "approved",
      actor: "admin@internal",
      details: "Tool approved by security reviewer",
    },
    {
      id: 4,
      timestamp: "2026-04-26T13:20:00Z",
      tenant_id: "acme-corp",
      resource_type: "agent",
      resource_id: "support-bot",
      from_state: "staged",
      to_state: "active",
      actor: "devops@acme.com",
      details: "Agent deployed to production",
    },
    {
      id: 5,
      timestamp: "2026-04-26T12:45:00Z",
      tenant_id: "default-tenant",
      resource_type: "sub_agent",
      resource_id: "data-processor-child",
      from_state: "draft",
      to_state: "draft",
      actor: "engineer@internal",
      details: "Sub-agent configuration updated",
    },
  ];

  const filteredEvents = events.filter((event) => {
    if (filterResourceType !== "all" && event.resource_type !== filterResourceType) return false;
    if (filterTenant !== "all" && event.tenant_id !== filterTenant) return false;
    return true;
  });

  const resourceTypes = [
    { id: "all", label: "All Resources" },
    { id: "agent", label: "Agent" },
    { id: "skill", label: "Skill" },
    { id: "tool", label: "Tool" },
    { id: "sub_agent", label: "Sub-Agent" },
  ];

  const tenants = [
    { id: "all", label: "All Tenants" },
    { id: "default-tenant", label: "Default Tenant" },
    { id: "acme-corp", label: "ACME Corp" },
  ];

  function getResourceColor(type: string): string {
    switch (type) {
      case "agent":
        return "bg-blue-500/15 text-blue-400";
      case "skill":
        return "bg-purple-500/15 text-purple-400";
      case "tool":
        return "bg-green-500/15 text-green-400";
      case "sub_agent":
        return "bg-orange-500/15 text-orange-400";
      default:
        return "bg-gray-500/15 text-gray-400";
    }
  }

  function getStateColor(state: string): string {
    switch (state) {
      case "active":
        return "bg-green-500/15 text-green-400";
      case "staged":
        return "bg-blue-500/15 text-blue-400";
      case "approved":
        return "bg-green-500/15 text-green-400";
      case "pending_review":
        return "bg-yellow-500/15 text-yellow-400";
      case "draft":
        return "bg-gray-500/15 text-gray-400";
      default:
        return "bg-gray-500/15 text-gray-400";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Audit Log</h1>
          <p className="text-muted-foreground mt-1">
            Immutable record of all platform lifecycle events
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-md text-sm font-medium">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-2">Resource Type</label>
            <select
              value={filterResourceType}
              onChange={(e) => setFilterResourceType(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {resourceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-2">Tenant</label>
            <select
              value={filterTenant}
              onChange={(e) => setFilterTenant(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Timestamp</th>
                <th className="text-left py-3 px-4 font-medium">Tenant</th>
                <th className="text-left py-3 px-4 font-medium">Resource</th>
                <th className="text-left py-3 px-4 font-medium">State Change</th>
                <th className="text-left py-3 px-4 font-medium">Actor</th>
                <th className="text-left py-3 px-4 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.map((event) => (
                <tr
                  key={event.id}
                  onClick={() => setSelectedEvent(selectedEvent === event.id ? null : event.id)}
                  className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="py-3 px-4 font-mono text-xs">
                    {new Date(event.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm">{event.tenant_id}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getResourceColor(event.resource_type)}`}>
                        {event.resource_type}
                      </span>
                      <span className="font-mono text-xs">{event.resource_id}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStateColor(event.from_state)}`}>
                        {event.from_state}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStateColor(event.to_state)}`}>
                        {event.to_state}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs">{event.actor}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground line-clamp-1">
                    {event.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredEvents.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No audit events found matching filters
          </div>
        )}
      </div>

      {/* Event Details Modal */}
      {selectedEvent !== null && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="font-semibold mb-4">Event Details</h3>
          {(() => {
            const event = events.find((e) => e.id === selectedEvent);
            if (!event) return null;
            return (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
                  <p>{new Date(event.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Actor</p>
                  <p className="font-mono">{event.actor}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tenant</p>
                  <p className="font-mono">{event.tenant_id}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Resource</p>
                  <p>{`${event.resource_type} (${event.resource_id})`}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">State Change</p>
                  <p>
                    <span className={`px-2.5 py-1 rounded text-xs font-medium ${getStateColor(event.from_state)}`}>
                      {event.from_state}
                    </span>
                    <span className="mx-2">→</span>
                    <span className={`px-2.5 py-1 rounded text-xs font-medium ${getStateColor(event.to_state)}`}>
                      {event.to_state}
                    </span>
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Details</p>
                  <p>{event.details}</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {filteredEvents.length} of {events.length} events
        </p>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 rounded text-sm bg-muted hover:bg-muted/80 disabled:opacity-50">
            Previous
          </button>
          <button className="px-3 py-1.5 rounded text-sm bg-muted hover:bg-muted/80 disabled:opacity-50">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
