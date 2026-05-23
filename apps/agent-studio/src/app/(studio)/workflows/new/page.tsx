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
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import YAML from "js-yaml";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenant } from "@/lib/hooks";

const SAMPLE_YAML = `id: my-workflow
version: 1.0.0
steps:
  - id: step1
    type: task
    skill_name: fetch-data
  - id: step2
    type: agent
    agent_id: analyzer
    input_mapping:
      prompt: "Analyze: {{ steps.step1.output }}"
  - id: approve
    type: hitl
    prompt: "Review and approve?"
  - id: step3
    type: task
    skill_name: send-report`;

export default function NewWorkflowPage() {
  const router = useRouter();
  const { tenantId } = useTenant();
  const [workflowId, setWorkflowId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workflowType, setWorkflowType] = useState<"yaml" | "code">("yaml");
  const [yaml, setYaml] = useState(SAMPLE_YAML);
  const [taskQueue, setTaskQueue] = useState("platform-hybrid-queue");
  const [triggerType, setTriggerType] = useState<"manual" | "webhook" | "cron" | "event">("manual");
  const [triggerConfig, setTriggerConfig] = useState("");
  const [yamlError, setYamlError] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      // Parse YAML definition
      let definition: Record<string, unknown>;
      try {
        definition = YAML.load(yaml) as Record<string, unknown>;
        setYamlError("");
      } catch (e) {
        setYamlError(`Invalid YAML: ${String(e)}`);
        throw e;
      }

      // Parse trigger config
      let parsedTriggerConfig: Record<string, unknown> = { type: triggerType };
      if (triggerConfig) {
        try {
          parsedTriggerConfig = JSON.parse(triggerConfig);
          parsedTriggerConfig.type = triggerType;
        } catch {
          // Continue with minimal config
        }
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_GATEWAY_URL}/api/v1/workflows`, {
        method: "POST",
        headers: {
          "X-Tenant-ID": tenantId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: workflowId,
          name,
          description,
          workflow_type: workflowType,
          task_queue: taskQueue,
          definition,
          trigger_config: parsedTriggerConfig,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get("content-type") || "";
        let errorMsg = "Failed to create workflow";

        if (contentType.includes("application/json")) {
          try {
            const error = await response.json();
            errorMsg = error.error || errorMsg;
          } catch {
            errorMsg = `API error: ${response.status} ${response.statusText}`;
          }
        } else {
          errorMsg = `API error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      return await response.json();
    },
    onSuccess: () => {
      router.push("/workflows");
    },
  });

  const handleValidateYaml = () => {
    try {
      YAML.load(yaml);
      setYamlError("");
    } catch (e) {
      setYamlError(`Invalid YAML: ${String(e)}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/workflows">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Create Workflow</h1>
      </div>

      <Separator />

      {/* Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
        className="space-y-6"
      >
        {/* Basic Info */}
        <div className="space-y-4">
          <h2 className="font-semibold">Basic Information</h2>

          <div>
            <Label>Workflow ID</Label>
            <Input
              placeholder="my-workflow"
              value={workflowId}
              onChange={(e) => setWorkflowId(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Name</Label>
            <Input
              placeholder="My Workflow"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea
              placeholder="Describe what this workflow does..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label>Workflow Type</Label>
            <Select value={workflowType} onValueChange={(v) => setWorkflowType(v as "yaml" | "code")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="yaml">YAML Definition</SelectItem>
                <SelectItem value="code">Code Reference</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Task Queue</Label>
            <Input
              placeholder="platform-hybrid-queue"
              value={taskQueue}
              onChange={(e) => setTaskQueue(e.target.value)}
            />
          </div>
        </div>

        <Separator />

        {/* YAML Editor */}
        <div className="space-y-4">
          <h2 className="font-semibold">Workflow Definition</h2>

          <div className="relative">
            <Textarea
              placeholder="Enter YAML workflow definition..."
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              className="font-mono text-sm h-64"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              {yamlError && <p className="text-sm text-red-500">{yamlError}</p>}
              {!yamlError && yaml && <p className="text-sm text-green-500">✓ Valid YAML</p>}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleValidateYaml}>
              Validate YAML
            </Button>
          </div>
        </div>

        <Separator />

        {/* Trigger Config */}
        <div className="space-y-4">
          <h2 className="font-semibold">Trigger Configuration</h2>

          <div>
            <Label>Trigger Type</Label>
            <Select
              value={triggerType}
              onValueChange={(v) => setTriggerType(v as "manual" | "webhook" | "cron" | "event")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (via API)</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="cron">Cron Schedule</SelectItem>
                <SelectItem value="event">Event-Driven</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {triggerType === "webhook" && (
            <div>
              <Label>Webhook Secret (JSON)</Label>
              <Textarea
                placeholder='{"webhook_secret": "your-secret-key"}'
                value={triggerConfig}
                onChange={(e) => setTriggerConfig(e.target.value)}
                className="font-mono text-sm h-24"
              />
            </div>
          )}

          {triggerType === "cron" && (
            <div>
              <Label>Cron Configuration (JSON)</Label>
              <Textarea
                placeholder='{"cron": "0 17 * * 1-5"}'
                value={triggerConfig}
                onChange={(e) => setTriggerConfig(e.target.value)}
                className="font-mono text-sm h-24"
              />
            </div>
          )}

          {triggerType === "event" && (
            <div>
              <Label>Event Configuration (JSON)</Label>
              <Textarea
                placeholder='{"event_name": "settlement.fail"}'
                value={triggerConfig}
                onChange={(e) => setTriggerConfig(e.target.value)}
                className="font-mono text-sm h-24"
              />
            </div>
          )}
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={mutation.isPending || !workflowId || !yaml || yamlError !== ""}
          >
            {mutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Workflow
          </Button>
          <Link href="/workflows">
            <Button variant="outline">Cancel</Button>
          </Link>
        </div>

        {mutation.error && (
          <p className="text-sm text-red-500">{String(mutation.error)}</p>
        )}
      </form>
    </div>
  );
}
