"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
import { adminApi } from "@/lib/api";

export default function ExecutionDetailPage({ params }: { params: { id: string } }) {
  const sessionId = params.id;
  const [pollingInterval, setPollingInterval] = useState<number | false>(1000);

  const { data: execution, isLoading, isError, error } = useQuery({
    queryKey: ["execution", sessionId],
    queryFn: () => adminApi.getExecution(sessionId),
    refetchInterval: pollingInterval,
  });

  useEffect(() => {
    if (execution?.status === "COMPLETED" || execution?.status === "FAILED" || execution?.status === "CANCELLED") {
      setPollingInterval(false);
    }
  }, [execution?.status]);

  const statusColors: Record<string, string> = {
    RUNNING: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    COMPLETED: "bg-green-500/15 text-green-400 border border-green-500/30",
    FAILED: "bg-red-500/15 text-red-400 border border-red-500/30",
    CANCELLED: "bg-gray-500/15 text-gray-400 border border-gray-500/30",
  };

  const getStatusColor = (status: string) => statusColors[status] || statusColors.COMPLETED;

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case "thinking":
        return "💭";
      case "tool_call":
        return "🔧";
      case "tool_result":
        return "✅";
      case "text":
        return "💬";
      case "done":
        return "🏁";
      case "error":
        return "❌";
      default:
        return "•";
    }
  };

  const events = execution?.events || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Execution Trace</h1>
        <p className="text-muted-foreground mt-1">{sessionId}</p>
      </div>

      {isError && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span>{error instanceof Error ? error.message : "Failed to load execution"}</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : execution ? (
        <>
          {/* Execution Header */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Status</div>
                <div className={`text-lg font-bold mt-2 inline-block px-3 py-1 rounded ${getStatusColor(execution.status)}`}>
                  {execution.status}
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Started</div>
                <div className="text-sm font-mono mt-2">{new Date(execution.start_time).toLocaleString()}</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Duration</div>
                <div className="text-sm font-mono mt-2">{formatDuration(execution.duration_ms)}</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground">Events</div>
                <div className="text-lg font-bold mt-2">{events.length}</div>
              </div>
            </div>
          </div>

          {/* Horizontal Timeline */}
          {events.length > 0 ? (
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-6">Event Timeline</h2>

              <div className="overflow-x-auto pb-4">
                <div className="flex gap-2 min-w-max">
                  {events.map((event: any, idx: number) => (
                    <div key={idx} className="flex flex-col items-center">
                      {/* Event Node */}
                      <div className={`
                        w-12 h-12 rounded-full flex items-center justify-center text-xl
                        ${
                          event.type === "thinking"
                            ? "bg-purple-500/20 border border-purple-500/50"
                            : event.type === "tool_call"
                            ? "bg-blue-500/20 border border-blue-500/50"
                            : event.type === "tool_result"
                            ? "bg-green-500/20 border border-green-500/50"
                            : event.type === "text"
                            ? "bg-cyan-500/20 border border-cyan-500/50"
                            : event.type === "done"
                            ? "bg-green-500/20 border border-green-500/50"
                            : "bg-red-500/20 border border-red-500/50"
                        }
                      `}>
                        {getEventTypeIcon(event.type)}
                      </div>

                      {/* Event Connector */}
                      {idx < events.length - 1 && (
                        <div className="w-1 h-8 bg-border/50 mx-auto mt-1" />
                      )}

                      {/* Event Label */}
                      <div className="text-xs font-medium mt-2 text-center">
                        {event.type === "tool_call" ? event.name : event.type}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Event Details */}
              <div className="mt-8 space-y-4 border-t border-border pt-6">
                {events.map((event: any, idx: number) => (
                  <div key={idx} className="bg-muted/30 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-xl mt-1">{getEventTypeIcon(event.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm">
                          {event.type === "tool_call" ? `Tool: ${event.name}` : event.type.charAt(0).toUpperCase() + event.type.slice(1)}
                        </div>

                        {event.type === "thinking" && (
                          <div className="text-sm text-muted-foreground mt-2 break-words">{event.content}</div>
                        )}

                        {event.type === "tool_call" && event.args && (
                          <div className="text-xs bg-background rounded p-2 mt-2 overflow-auto max-h-32 font-mono">
                            <div className="text-muted-foreground mb-1">Arguments:</div>
                            <pre className="text-xs whitespace-pre-wrap break-words">{event.args}</pre>
                          </div>
                        )}

                        {event.type === "tool_result" && event.result && (
                          <div className="text-xs bg-background rounded p-2 mt-2 overflow-auto max-h-32 font-mono">
                            <div className="text-muted-foreground mb-1">Result:</div>
                            <pre className="text-xs whitespace-pre-wrap break-words">{event.result}</pre>
                          </div>
                        )}

                        {event.type === "text" && (
                          <div className="text-sm text-muted-foreground mt-2 break-words">{event.content}</div>
                        )}

                        {event.type === "error" && (
                          <div className="text-sm text-red-400 mt-2 break-words">{event.content}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
              <p>No events yet</p>
              {execution.status === "RUNNING" && (
                <p className="text-xs mt-2">Polling for updates every 1 second...</p>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
