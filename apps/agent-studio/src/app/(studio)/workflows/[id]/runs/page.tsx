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

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft, Play, Eye, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/lib/hooks";

interface WorkflowRun {
  run_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  started_at: string;
  completed_at?: string;
  step_results?: Record<string, unknown>;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400",
  running: "bg-blue-500/15 text-blue-400",
  completed: "bg-green-500/15 text-green-400",
  failed: "bg-red-500/15 text-red-400",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_ICONS: Record<string, typeof AlertCircle> = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: AlertCircle,
  cancelled: AlertCircle,
};

function formatDate(date: string) {
  return new Date(date).toLocaleString();
}

function calculateDuration(startedAt: string, completedAt?: string) {
  if (!completedAt) return "—";
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

export default function WorkflowRunsPage() {
  const params = useParams();
  const router = useRouter();
  const { tenantId } = useTenant();
  const workflowId = params.id as string;
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: runs, isLoading, error } = useQuery({
    queryKey: ["workflow-runs", workflowId, tenantId],
    queryFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_GATEWAY_URL}/api/v1/workflows/${workflowId}/runs`,
        {
          headers: { "X-Tenant-ID": tenantId },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch runs");
      const data = await response.json();
      return (data.runs || []) as WorkflowRun[];
    },
    refetchInterval: autoRefresh ? 3000 : false,
    enabled: !!tenantId,
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_GATEWAY_URL}/api/v1/workflows/${workflowId}/trigger`,
        {
          method: "POST",
          headers: {
            "X-Tenant-ID": tenantId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs: {} }),
        }
      );
      if (!response.ok) throw new Error("Failed to trigger workflow");
      return await response.json();
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/workflows">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{workflowId}</h1>
            <p className="text-muted-foreground">Workflow execution history</p>
          </div>
        </div>
        <Button
          onClick={() => triggerMutation.mutate()}
          disabled={triggerMutation.isPending}
          className="gap-2"
        >
          {triggerMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          <Play className="w-4 h-4" />
          Trigger Now
        </Button>
      </div>

      <Separator />

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
        </Button>
      </div>

      {/* Runs List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">
          <p>Failed to load runs</p>
        </div>
      ) : !runs || runs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No runs yet</p>
          <Button onClick={() => triggerMutation.mutate()} className="gap-2">
            <Play className="w-4 h-4" />
            Trigger your first run
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const StatusIcon = STATUS_ICONS[run.status];
            return (
              <Link key={run.run_id} href={`/workflow-runs/${run.run_id}`}>
                <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <StatusIcon
                        className={`w-5 h-5 ${
                          run.status === "running" ? "animate-spin" : ""
                        }`}
                      />
                      <div className="flex-1">
                        <p className="font-mono text-sm">{run.run_id.slice(0, 8)}...</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDate(run.started_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Duration</p>
                        <p className="text-sm font-mono">
                          {calculateDuration(run.started_at, run.completed_at)}
                        </p>
                      </div>
                      <Badge variant="outline" className={STATUS_COLORS[run.status]}>
                        {run.status}
                      </Badge>
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
