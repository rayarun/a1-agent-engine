"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";

export default function ExecutionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [expandedEvents, setExpandedEvents] = useState<Set<number>>(new Set());

  const execution = {
    session_id: sessionId,
    tenant_id: "default-tenant",
    agent_id: "manifest-assistant",
    status: "RUNNING",
    start_time: "2026-04-26T14:35:00Z",
    duration: 2100,
  };

  const events = [
    {
      id: 1,
      type: "thinking",
      timestamp: "2026-04-26T14:35:00Z",
      content:
        "The user is asking me to analyze an agent manifest and suggest improvements for performance optimization.",
    },
    {
      id: 2,
      type: "tool_call",
      timestamp: "2026-04-26T14:35:02Z",
      tool: "retrieve_documents",
      args: { query: "agent performance patterns", limit: 5 },
    },
    {
      id: 3,
      type: "tool_result",
      timestamp: "2026-04-26T14:35:04Z",
      tool: "retrieve_documents",
      result: [
        { title: "Prompt optimization guide", relevance: 0.92 },
        { title: "Tool routing best practices", relevance: 0.87 },
      ],
    },
    {
      id: 4,
      type: "thinking",
      timestamp: "2026-04-26T14:35:05Z",
      content:
        "Based on the retrieved documents, I can now provide recommendations on optimizing the agent manifest for better performance.",
    },
    {
      id: 5,
      type: "text",
      timestamp: "2026-04-26T14:35:06Z",
      content:
        "I've analyzed your agent manifest and identified several optimization opportunities:\n\n1. **Prompt Optimization**: Reduce system prompt verbosity by 30%\n2. **Tool Routing**: Consolidate similar tools into skill groups\n3. **Memory Usage**: Implement selective memory pruning for long sessions",
    },
  ];

  function toggleEvent(id: number) {
    const newExpanded = new Set(expandedEvents);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedEvents(newExpanded);
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Execution Trace</h1>
          <p className="text-muted-foreground mt-1 font-mono text-sm">{sessionId}</p>
        </div>
        <div className="text-right">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
              execution.status === "RUNNING"
                ? "bg-blue-500/15 text-blue-400"
                : execution.status === "COMPLETED"
                ? "bg-green-500/15 text-green-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {execution.status}
          </span>
        </div>
      </div>

      {/* Header Info */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Tenant</p>
            <p className="text-sm font-mono">{execution.tenant_id}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Agent</p>
            <p className="text-sm font-mono">{execution.agent_id}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Started</p>
            <p className="text-sm">
              {new Date(execution.start_time).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Duration</p>
            <p className="text-sm">
              {execution.duration < 60
                ? `${execution.duration}s`
                : `${Math.floor(execution.duration / 60)}m ${execution.duration % 60}s`}
            </p>
          </div>
        </div>

        {execution.status === "RUNNING" && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
            <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-blue-400">Live stream active</span>
          </div>
        )}
      </div>

      {/* Event Timeline */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold mb-4">Event Timeline</h2>

        {events.map((event) => (
          <div key={event.id} className="bg-card border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleEvent(event.id)}
              className="w-full p-4 flex items-start justify-between hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-start gap-3 flex-1">
                <div
                  className={`mt-1 flex-shrink-0 h-2 w-2 rounded-full ${
                    event.type === "thinking"
                      ? "bg-yellow-500"
                      : event.type === "tool_call"
                      ? "bg-purple-500"
                      : event.type === "tool_result"
                      ? "bg-blue-500"
                      : "bg-green-500"
                  }`}
                ></div>

                <div className="text-left flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-xs font-medium capitalize px-1.5 py-0.5 bg-muted rounded">
                      {event.type === "tool_call" ? `${event.tool}` : event.type}
                    </span>
                  </div>

                  <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {event.type === "thinking" && event.content}
                    {event.type === "tool_call" &&
                      `Call ${event.tool} with ${event.args ? Object.keys(event.args).length : 0} args`}
                    {event.type === "tool_result" &&
                      `Result: ${JSON.stringify(event.result).substring(0, 80)}...`}
                    {event.type === "text" && event.content ? event.content.split("\n")[0] : ""}
                  </div>
                </div>
              </div>

              <div className="ml-2 flex-shrink-0">
                {expandedEvents.has(event.id) ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {expandedEvents.has(event.id) && (
              <div className="p-4 border-t border-border bg-muted/30 space-y-2">
                {event.type === "thinking" && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Thinking</p>
                    <div className="bg-background border border-border rounded p-3 text-sm whitespace-pre-wrap font-mono max-h-64 overflow-y-auto">
                      {event.content}
                    </div>
                  </div>
                )}

                {event.type === "tool_call" && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      Tool: {event.tool}
                    </p>
                    <div className="bg-background border border-border rounded p-3 text-sm font-mono max-h-64 overflow-y-auto">
                      {JSON.stringify(event.args, null, 2)}
                    </div>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(event.args, null, 2))}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </button>
                  </div>
                )}

                {event.type === "tool_result" && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Result</p>
                    <div className="bg-background border border-border rounded p-3 text-sm font-mono max-h-64 overflow-y-auto">
                      {JSON.stringify(event.result, null, 2)}
                    </div>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(event.result, null, 2))}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </button>
                  </div>
                )}

                {event.type === "text" && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Response</p>
                    <div className="bg-background border border-border rounded p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {event.content}
                    </div>
                    <button
                      onClick={() => event.content && copyToClipboard(event.content)}
                      className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
