"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Loader2, Zap, Edit2 } from "lucide-react";
import { skillsApi, toolsApi } from "@/lib/api";
import { SkillManifest } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const skillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().min(1),
  sop: z.string().min(1, "SOP required"),
  mutating: z.boolean(),
  approval_required: z.boolean(),
  published_by: z.string().min(1),
  tools: z.array(z.object({ name: z.string().min(1), version: z.string().min(1) })),
});

type SkillForm = z.infer<typeof skillSchema>;

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  staged: "bg-yellow-500/15 text-yellow-400",
  active: "bg-green-500/15 text-green-400",
  paused: "bg-orange-500/15 text-orange-400",
  archived: "bg-muted text-muted-foreground line-through",
};

function CreateSkillSheet({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<SkillForm>({
    resolver: zodResolver(skillSchema),
    defaultValues: {
      mutating: false,
      approval_required: false,
      tools: [{ name: "", version: "1.0.0" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "tools" });

  const { data: approvedTools } = useQuery({
    queryKey: ["tools", "approved"],
    queryFn: () => toolsApi.list("approved"),
  });

  const mutation = useMutation({
    mutationFn: (data: SkillForm) => skillsApi.create(data),
    onSuccess: () => { reset(); setOpen(false); onCreated(); },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="h-4 w-4" />
        Create Skill
      </SheetTrigger>
      <SheetContent className="w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Create Skill</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="mt-6 flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Skill ID</Label>
              <Input placeholder="skill-uuid" {...register("id")} />
              {errors.id && <p className="text-xs text-destructive">{errors.id.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Version</Label>
              <Input placeholder="1.0.0" {...register("version")} />
              {errors.version && <p className="text-xs text-destructive">{errors.version.message}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input placeholder="query-slow-logs" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Input placeholder="Short description" {...register("description")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Standard Operating Procedure (SOP)</Label>
            <Textarea
              rows={5}
              placeholder="Step-by-step instructions the agent follows..."
              {...register("sop")}
            />
            {errors.sop && <p className="text-xs text-destructive">{errors.sop.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Tools</Label>
              <button
                type="button"
                onClick={() => append({ name: "", version: "1.0.0" })}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Tool
              </button>
            </div>
            {approvedTools && approvedTools.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Approved tools: {approvedTools.map((t) => t.name).join(", ")}
              </p>
            )}
            {fields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  placeholder="tool-name"
                  {...register(`tools.${i}.name`)}
                  className="flex-1"
                />
                <Input
                  placeholder="1.0.0"
                  {...register(`tools.${i}.version`)}
                  className="w-24"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register("mutating")} />
              Mutating (HITL required)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register("approval_required")} />
              Approval Required
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Published By</Label>
            <Input placeholder="platform-admin" {...register("published_by")} />
          </div>

          {mutation.error && (
            <p className="text-xs text-destructive">{String(mutation.error)}</p>
          )}

          <Button type="submit" disabled={mutation.isPending} className="mt-2">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Skill
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EditSkillSheet({ skill, onUpdated }: { skill: SkillManifest; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, control, formState: { errors } } = useForm<SkillForm>({
    resolver: zodResolver(skillSchema),
    values: {
      id: skill.id,
      name: skill.name,
      version: skill.version,
      description: skill.description,
      sop: skill.sop,
      mutating: skill.mutating,
      approval_required: skill.approval_required,
      published_by: skill.published_by,
      tools: skill.tools ?? [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "tools" });

  const { data: approvedTools } = useQuery({
    queryKey: ["tools", "approved"],
    queryFn: () => toolsApi.list("approved"),
  });

  const mutation = useMutation({
    mutationFn: (data: SkillForm) => skillsApi.update(skill.id, { ...data, status: skill.status }),
    onSuccess: () => { setOpen(false); onUpdated(); },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" variant="ghost" className="h-7 w-7 p-0" />}>
        <Edit2 className="h-4 w-4" />
      </SheetTrigger>
      <SheetContent className="w-[520px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit Skill</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="mt-6 flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Skill ID</Label>
              <Input placeholder="skill-uuid" {...register("id")} disabled />
              {errors.id && <p className="text-xs text-destructive">{errors.id.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Version</Label>
              <Input placeholder="1.0.0" {...register("version")} />
              {errors.version && <p className="text-xs text-destructive">{errors.version.message}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input placeholder="query-slow-logs" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Description</Label>
            <Input placeholder="Short description" {...register("description")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Standard Operating Procedure (SOP)</Label>
            <Textarea
              rows={5}
              placeholder="Step-by-step instructions the agent follows..."
              {...register("sop")}
            />
            {errors.sop && <p className="text-xs text-destructive">{errors.sop.message}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Tools</Label>
              <button
                type="button"
                onClick={() => append({ name: "", version: "1.0.0" })}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add Tool
              </button>
            </div>
            {approvedTools && approvedTools.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Approved tools: {approvedTools.map((t) => t.name).join(", ")}
              </p>
            )}
            {fields.map((field, i) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  placeholder="tool-name"
                  {...register(`tools.${i}.name`)}
                  className="flex-1"
                />
                <Input
                  placeholder="1.0.0"
                  {...register(`tools.${i}.version`)}
                  className="w-24"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register("mutating")} />
              Mutating (HITL required)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" {...register("approval_required")} />
              Approval Required
            </label>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Published By</Label>
            <Input placeholder="platform-admin" {...register("published_by")} />
          </div>

          {mutation.error && (
            <p className="text-xs text-destructive">{String(mutation.error)}</p>
          )}

          <Button type="submit" disabled={mutation.isPending} className="mt-2">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default function SkillsPage() {
  const qc = useQueryClient();
  const { data: skills, isLoading, isError } = useQuery({
    queryKey: ["skills"],
    queryFn: () => skillsApi.list(),
  });

  const stageMutation = useMutation({
    mutationFn: (id: string) =>
      skillsApi.transition(id, { target_state: "staged", actor: "studio-user" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) =>
      skillsApi.transition(id, { target_state: "active", actor: "studio-user" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Skill Catalog</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Governed compositions of tools with SOPs and RBAC flags
          </p>
        </div>
        <CreateSkillSheet onCreated={() => qc.invalidateQueries({ queryKey: ["skills"] })} />
      </div>

      <Separator className="mb-6" />

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive py-4">Failed to load skills. Is skill-catalog running on :8087?</p>
      )}

      {skills && skills.length === 0 && (
        <div className="text-center py-20 text-muted-foreground text-sm">
          No skills yet. Click <strong>Create Skill</strong> to compose one from tools.
        </div>
      )}

      {skills && skills.length > 0 && (
        <div className="flex flex-col gap-2">
          {skills.map((skill: SkillManifest) => (
            <div
              key={skill.id}
              className="rounded-lg border border-border bg-card px-4 py-3 text-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Zap className="h-4 w-4 text-yellow-400 shrink-0" />
                    <span className="font-medium font-mono">{skill.name}</span>
                    <span className="text-xs text-muted-foreground">v{skill.version}</span>
                    {skill.mutating && (
                      <Badge variant="destructive" className="text-xs">mutating</Badge>
                    )}
                    {skill.approval_required && (
                      <Badge variant="secondary" className="text-xs">approval required</Badge>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[skill.status] ?? ""}`}>
                      {skill.status}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-1 truncate">{skill.description}</p>
                  {skill.tools?.length > 0 && (
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {skill.tools.map((t) => (
                        <span key={t.name + t.version} className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                          {t.name}@{t.version}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {skill.status !== "archived" && (
                    <EditSkillSheet skill={skill} onUpdated={() => qc.invalidateQueries({ queryKey: ["skills"] })} />
                  )}
                  {skill.status === "draft" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => stageMutation.mutate(skill.id)}
                      disabled={stageMutation.isPending}
                    >
                      Stage
                    </Button>
                  )}
                  {skill.status === "staged" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => activateMutation.mutate(skill.id)}
                      disabled={activateMutation.isPending}
                    >
                      Activate
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
