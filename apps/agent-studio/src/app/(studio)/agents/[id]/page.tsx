"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { use } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Bot, MessageSquare, ArrowLeft, Loader2, Zap, Edit2, Trash2, Plus } from "lucide-react";
import { agentsApi, skillsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const agentSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  system_prompt: z.string().min(10, "System prompt too short"),
  model: z.string().min(1),
  max_iterations: z.number().int().min(1).max(100),
  memory_budget_mb: z.number().int().min(64),
  skills: z.array(z.object({ name: z.string().min(1), version: z.string().min(1) })).optional(),
});

type AgentForm = z.infer<typeof agentSchema>;

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  staged: "Staged",
  active: "Active",
  paused: "Paused",
  archived: "Archived",
};

function EditAgentSheet({ agent, onUpdated }: { agent: any; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<AgentForm>({
    resolver: zodResolver(agentSchema),
    values: {
      name: agent.name || "",
      version: agent.version || "1.0.0",
      system_prompt: agent.system_prompt || "",
      model: agent.model || "",
      max_iterations: agent.max_iterations || 20,
      memory_budget_mb: agent.memory_budget_mb || 256,
      skills: agent.skills || [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "skills" });

  const { data: activeSkills } = useQuery({
    queryKey: ["skills", "active"],
    queryFn: () => skillsApi.list("active"),
  });

  const mutation = useMutation({
    mutationFn: (data: AgentForm) => agentsApi.update(agent.id, data),
    onSuccess: () => { setOpen(false); onUpdated(); },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>
        <Button size="sm" variant="outline" className="gap-1.5">
          <Edit2 className="h-4 w-4" />
          Edit
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Agent</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="mt-6 flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input placeholder="incident-responder" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Version</Label>
              <Input placeholder="1.0.0" {...register("version")} />
              {errors.version && <p className="text-xs text-destructive">{errors.version.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Model</Label>
              <Input placeholder="claude-opus-4-7" {...register("model")} />
              {errors.model && <p className="text-xs text-destructive">{errors.model.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Max Iterations</Label>
              <Input
                type="number"
                placeholder="20"
                {...register("max_iterations", { valueAsNumber: true })}
              />
              {errors.max_iterations && (
                <p className="text-xs text-destructive">{errors.max_iterations.message}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Memory Budget (MB)</Label>
            <Input
              type="number"
              placeholder="256"
              {...register("memory_budget_mb", { valueAsNumber: true })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>System Prompt</Label>
            <Textarea
              placeholder="You are a helpful assistant..."
              className="min-h-[120px]"
              {...register("system_prompt")}
            />
            {errors.system_prompt && (
              <p className="text-xs text-destructive">{errors.system_prompt.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Skills</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => append({ name: "", version: "1.0.0" })}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  placeholder="skill-name"
                  {...register(`skills.${index}.name`)}
                  className="flex-1"
                />
                <Input
                  placeholder="1.0.0"
                  {...register(`skills.${index}.version`)}
                  className="w-24"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => remove(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agents", id],
    queryFn: () => agentsApi.get(id),
  });

  const deployMutation = useMutation({
    mutationFn: async () => {
      if (agent?.status === "draft") {
        await agentsApi.transition(id, { target_state: "staged", actor: "studio-user" });
      }
      return agentsApi.transition(id, { target_state: "active", actor: "studio-user" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents", id] }),
  });

  const pauseMutation = useMutation({
    mutationFn: () =>
      agentsApi.transition(id, { target_state: "paused", actor: "studio-user" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents", id] }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Agent not found.</div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/agents">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Agents
          </Button>
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{agent.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground font-mono">v{agent.version}</span>
              <Badge variant={agent.status === "active" ? "default" : "secondary"}>
                {STATUS_LABELS[agent.status] ?? agent.status}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {agent.status === "draft" && <EditAgentSheet agent={agent} onUpdated={() => qc.invalidateQueries({ queryKey: ["agents", id] })} />}
          {agent.status === "active" && (
            <>
              <Link href={`/agents/${id}/chat`}>
                <Button size="sm" className="gap-1.5">
                  <MessageSquare className="h-4 w-4" />
                  Open Chat
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => pauseMutation.mutate()}
                disabled={pauseMutation.isPending}
              >
                {pauseMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Pause"}
              </Button>
            </>
          )}
          {(agent.status === "draft" || agent.status === "staged") && (
            <Button
              size="sm"
              onClick={() => deployMutation.mutate()}
              disabled={deployMutation.isPending}
            >
              {deployMutation.isPending ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : null}
              Deploy
            </Button>
          )}
        </div>
      </div>

      <Separator className="mb-6" />

      <div className="grid gap-6">
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Configuration
          </h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground mb-1">Model</div>
              <div className="font-mono">{agent.model}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground mb-1">Max Iterations</div>
              <div className="font-mono">{agent.max_iterations}</div>
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-xs text-muted-foreground mb-1">Memory Budget</div>
              <div className="font-mono">{agent.memory_budget_mb} MB</div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            System Prompt
          </h2>
          <pre className="rounded-lg border border-border bg-card p-4 text-sm font-mono whitespace-pre-wrap leading-relaxed">
            {agent.system_prompt}
          </pre>
        </section>

        {agent.skills?.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Skills ({agent.skills.length})
            </h2>
            <div className="flex flex-col gap-2">
              {agent.skills.map((skill: any) => (
                <div
                  key={skill.name + skill.version}
                  className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
                >
                  <Zap className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="font-mono">{skill.name}</span>
                  <span className="text-xs text-muted-foreground">v{skill.version}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
