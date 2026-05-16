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
import { useQuery } from "@tanstack/react-query";
import { Plus, Loader2, Play, Eye, Clock, Radio, Webhook } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/lib/hooks";

interface Workflow {
  id: string;
  name: string;
  description: string;
  workflow_type: "yaml" | "code";
  task_queue: string;
  status: "active" | "paused" | "archived";
  created_at: string;
  trigger_type?: "manual" | "webhook" | "cron" | "event";
}

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-500/15 text-green-400",
  paused: "bg-orange-500/15 text-orange-400",
  archived: "bg-muted text-muted-foreground",
};

const WORKFLOW_TYPE_COLORS: Record<string, string> = {
  yaml: "bg-blue-500/15 text-blue-400",
  code: "bg-purple-500/15 text-purple-400",
};

const TRIGGER_ICONS: Record<string, typeof Plus> = {
  manual: Play,
  webhook: Webhook,
  cron: Clock,
  event: Radio,
};

function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const TriggerIcon = TRIGGER_ICONS[workflow.trigger_type || "manual"];

  return (
    <Link href={`/workflows/${workflow.id}/runs`}>
      <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="font-semibold text-sm">{workflow.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{workflow.description}</p>
          </div>
          <div className="flex gap-2 ml-4">
            <Badge variant="outline" className={WORKFLOW_TYPE_COLORS[workflow.workflow_type]}>
              {workflow.workflow_type}
            </Badge>
            <Badge variant="outline" className={STATUS_COLORS[workflow.status]}>
              {workflow.status}
            </Badge>
          </div>
        </div>

        <Separator className="my-3" />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>Queue: {workflow.task_queue}</span>
            {workflow.trigger_type && (
              <div className="flex items-center gap-1">
                <TriggerIcon className="w-3 h-3" />
                <span>{workflow.trigger_type}</span>
              </div>
            )}
          </div>
          <Eye className="w-4 h-4" />
        </div>
      </div>
    </Link>
  );
}

export default function WorkflowsPage() {
  const { tenantId } = useTenant();
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "paused" | "archived">("active");

  const { data: workflows, isLoading, error } = useQuery({
    queryKey: ["workflows", tenantId, filterStatus],
    queryFn: async () => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/workflows?status=${filterStatus}`,
        {
          headers: {
            "X-Tenant-ID": tenantId,
          },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch workflows");
      const data = await response.json();
      return (data.workflows || []) as Workflow[];
    },
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage hybrid Temporal workflows
          </p>
        </div>
        <Link href="/workflows/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            New Workflow
          </Button>
        </Link>
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "active", "paused", "archived"] as const).map((status) => (
          <Button
            key={status}
            variant={filterStatus === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterStatus(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {/* Workflows Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500">
          <p>Failed to load workflows</p>
        </div>
      ) : !workflows || workflows.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No workflows yet</p>
          <Link href="/workflows/new">
            <Button>Create your first workflow</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} />
          ))}
        </div>
      )}
    </div>
  );
}
