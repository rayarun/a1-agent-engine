// Copyright 2026 Arun Ray
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, CheckCircle2, AlertCircle, Clock, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/lib/hooks";

interface WorkflowRun {
  run_id: string;
  workflow_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  step_results: Record<string, { status: string; output?: unknown; error?: string; duration_ms?: number }>;
  output?: unknown;
  error?: string;
  started_at: string;
  completed_at?: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400",
  running: "bg-blue-500/15 text-blue-400",
  completed: "bg-green-500/15 text-green-400",
  failed: "bg-red-500/15 text-red-400",
  cancelled: "bg-muted text-muted-foreground",
};

function formatJson(obj: unknown) {
  return JSON.stringify(obj, null, 2);
}

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

export default function WorkflowRunPage() {
  const params = useParams();
  const { tenantId } = useTenant();
  const runId = params.id as string;

  const { data: run, isLoading, error } = useQuery({
    queryKey: ["workflow-run", runId, tenantId],
    queryFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/workflow-runs/${runId}`,
        {
          headers: { "X-Tenant-ID": tenantId },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch run");
      return (await response.json()) as WorkflowRun;
    },
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500 mb-4">Failed to load workflow run</p>
          <Link href="/workflows">
            <Button variant="outline">Back to Workflows</Button>
          </Link>
        </div>
      ) : run ? (
        <>
          <div className="flex items-center gap-2">
            <Link href={`/workflows/${run.workflow_id}/runs`}>
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold font-mono">{run.run_id.slice(0, 12)}...</h1>
              <p className="text-muted-foreground">
                Workflow: {run.workflow_id} • {formatDate(run.started_at)}
              </p>
            </div>
          </div>

          <Separator />

          {/* Status Overview */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Status</p>
              <Badge variant="outline" className={STATUS_COLORS[run.status]}>
                {run.status}
              </Badge>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Started</p>
              <p className="text-sm font-mono">{formatDate(run.started_at)}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Completed</p>
              <p className="text-sm font-mono">{run.completed_at ? formatDate(run.completed_at) : "—"}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-xs text-muted-foreground mb-2">Steps</p>
              <p className="text-sm font-mono">{Object.keys(run.step_results || {}).length}</p>
            </div>
          </div>

          <Separator />

          {/* Step Results */}
          <div className="space-y-4">
            <h2 className="font-semibold">Execution Steps</h2>

            {run.step_results && Object.keys(run.step_results).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(run.step_results).map(([stepId, result]) => (
                  <div key={stepId} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-mono font-semibold text-sm">{stepId}</p>
                      <Badge
                        variant="outline"
                        className={
                          result.status === "completed"
                            ? "bg-green-500/15 text-green-400"
                            : result.status === "failed"
                              ? "bg-red-500/15 text-red-400"
                              : "bg-yellow-500/15 text-yellow-400"
                        }
                      >
                        {result.status}
                      </Badge>
                    </div>

                    {result.duration_ms && (
                      <p className="text-xs text-muted-foreground mb-2">
                        Duration: {result.duration_ms}ms
                      </p>
                    )}

                    {result.output && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-1">Output</p>
                        <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                          {formatJson(result.output)}
                        </pre>
                      </div>
                    )}

                    {result.error && (
                      <div className="mt-3">
                        <p className="text-xs text-red-500 mb-1">Error</p>
                        <pre className="bg-red-500/10 p-2 rounded text-xs text-red-400 overflow-auto">
                          {result.error}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No steps executed yet</p>
            )}
          </div>

          {/* Final Output */}
          {run.output && (
            <>
              <Separator />
              <div className="space-y-4">
                <h2 className="font-semibold">Final Output</h2>
                <pre className="bg-muted p-4 rounded text-xs overflow-auto max-h-64">
                  {formatJson(run.output)}
                </pre>
              </div>
            </>
          )}

          {/* Error */}
          {run.error && (
            <>
              <Separator />
              <div className="space-y-4">
                <h2 className="font-semibold text-red-500">Error</h2>
                <pre className="bg-red-500/10 p-4 rounded text-xs text-red-400 overflow-auto">
                  {run.error}
                </pre>
              </div>
            </>
          )}

          {/* Note about DAG visualization */}
          <Separator />
          <div className="p-4 bg-muted/50 rounded-lg border border-dashed">
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> DAG visualization with @xyflow/react is available in Phase D.
              For now, review step results above for execution flow.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
