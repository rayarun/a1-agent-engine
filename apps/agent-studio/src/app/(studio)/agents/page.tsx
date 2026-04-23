"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Loader2, Bot, MessageSquare } from "lucide-react";
import Link from "next/link";
import { agentsApi, skillsApi } from "@/lib/api";
import { AgentRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const agentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  system_prompt: z.string().min(10, "System prompt too short"),
  model: z.string().min(1),
  max_iterations: z.number().int().min(1).max(100),
  memory_budget_mb: z.number().int().min(64),
  skills: z.array(z.object({ name: z.string().min(1), version: z.string().min(1) })),
});

type AgentForm = z.infer<typeof agentSchema>;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  staged: "bg-yellow-500/15 text-yellow-400",
  active: "bg-green-500/15 text-green-400",
  paused: "bg-orange-500/15 text-orange-400",
  archived: "bg-muted text-muted-foreground",
};

function CreateAgentSheet({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<AgentForm>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      model: "claude-opus-4-7",
      max_iterations: 20,
      memory_budget_mb: 256,
      version: "1.0.0",
      skills: [{ name: "", version: "1.0.0" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "skills" });

  const { data: activeSkills } = useQuery({
    queryKey: ["skills", "active"],
    queryFn: () => skillsApi.list("active"),
  });

  const mutation = useMutation({
    mutationFn: (data: AgentForm) => agentsApi.create(data),
    onSuccess: () => { reset(); setOpen(false); onCreated(); },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="h-4 w-4" />
        New Agent
      </SheetTrigger>
      <SheetContent className="w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create Agent</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="mt-6 flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Agent ID</Label>
              <Input placeholder="agent-uuid" {...register("id")} />
              {errors.id && <p className="text-xs text-destructive">{errors.id.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Version</Label>
              <Input placeholder="1.0.0" {...register("version")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input placeholder="incident-responder" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>System Prompt</Label>
            <Textarea
              rows={6}
              placeholder="You are an expert incident responder. Your goal is to..."
              {...register("system_prompt")}
            />
            {errors.system_prompt && <p className="text-xs text-destructive">{errors.system_prompt.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Model</Label>
              <Input placeholder="claude-opus-4-7" {...register("model")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Max Iterations</Label>
              <Input type="number" {...register("max_iterations", { valueAsNumber: true })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Memory (MB)</Label>
              <Input type="number" {...register("memory_budget_mb", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Skills</Label>
              <button
                type="button"
                onClick={() => append({ name: "", version: "1.0.0" })}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Skill
              </button>
            </div>
            {activeSkills && activeSkills.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Active skills: {activeSkills.map((s) => s.name).join(", ")}
              </p>
            )}
            {fields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input placeholder="skill-name" {...register(`skills.${i}.name`)} className="flex-1" />
                <Input placeholder="1.0.0" {...register(`skills.${i}.version`)} className="w-24" />
                <button type="button" onClick={() => remove(i)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {mutation.error && <p className="text-xs text-destructive">{String(mutation.error)}</p>}

          <Button type="submit" disabled={mutation.isPending} className="mt-2">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Agent
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default function AgentsPage() {
  const qc = useQueryClient();
  const { data: agents, isLoading, isError } = useQuery({
    queryKey: ["agents"],
    queryFn: () => agentsApi.list(),
  });

  const deployMutation = useMutation({
    mutationFn: async (id: string) => {
      await agentsApi.transition(id, { target_state: "staged", actor: "studio-user" });
      return agentsApi.transition(id, { target_state: "active", actor: "studio-user" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agents"] }),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Agents</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Autonomous agents composed from skills
          </p>
        </div>
        <CreateAgentSheet onCreated={() => qc.invalidateQueries({ queryKey: ["agents"] })} />
      </div>

      <Separator className="mb-6" />

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive py-4">Failed to load agents. Is agent-registry running on :8088?</p>
      )}

      {agents && agents.length === 0 && (
        <div className="text-center py-20 text-muted-foreground text-sm">
          No agents yet. Click <strong>New Agent</strong> to create one.
        </div>
      )}

      {agents && agents.length > 0 && (
        <div className="grid gap-3">
          {agents.map((agent: AgentRecord) => (
            <div
              key={agent.id}
              className="rounded-lg border border-border bg-card px-5 py-4 text-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Bot className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold">{agent.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">v{agent.version}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[agent.status] ?? ""}`}>
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs mt-1 line-clamp-2">{agent.system_prompt}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                    <span>model: <span className="font-mono text-foreground">{agent.model}</span></span>
                    <span>·</span>
                    <span>max_iter: {agent.max_iterations}</span>
                    {agent.skills?.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{agent.skills.length} skill{agent.skills.length !== 1 ? "s" : ""}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {agent.status === "active" && (
                    <Link href={`/agents/${agent.id}/chat`}>
                      <Button size="sm" className="gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Chat
                      </Button>
                    </Link>
                  )}
                  {agent.status === "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => deployMutation.mutate(agent.id)}
                      disabled={deployMutation.isPending && deployMutation.variables === agent.id}
                    >
                      {deployMutation.isPending && deployMutation.variables === agent.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : "Deploy"
                      }
                    </Button>
                  )}
                  <Link href={`/agents/${agent.id}`}>
                    <Button size="sm" variant="ghost">View</Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
