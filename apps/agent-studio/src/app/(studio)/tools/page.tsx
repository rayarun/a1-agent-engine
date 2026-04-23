"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { toolsApi } from "@/lib/api";
import { ToolSpec } from "@/lib/types";
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

const toolSchema = z.object({
  id: z.string().min(1, "ID required"),
  name: z.string().min(1, "Name required"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver (e.g. 1.0.0)"),
  description: z.string().min(1, "Description required"),
  auth_level: z.enum(["read", "mutating"]),
  sandbox_required: z.boolean(),
  registered_by: z.string().min(1, "Registered by required"),
});

type ToolForm = z.infer<typeof toolSchema>;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending_review: { label: "Pending Review", variant: "secondary" },
    approved: { label: "Approved", variant: "default" },
    deprecated: { label: "Deprecated", variant: "destructive" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "approved") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "deprecated") return <XCircle className="h-4 w-4 text-destructive" />;
  return <Clock className="h-4 w-4 text-muted-foreground" />;
}

function RegisterToolSheet({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<ToolForm>({
    resolver: zodResolver(toolSchema),
    defaultValues: { auth_level: "read", sandbox_required: false },
  });

  const mutation = useMutation({
    mutationFn: (data: ToolForm) => toolsApi.create(data),
    onSuccess: () => { reset(); setOpen(false); onCreated(); },
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button size="sm" className="gap-1.5" />}>
        <Plus className="h-4 w-4" />
        Register Tool
      </SheetTrigger>
      <SheetContent className="w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Register Tool</SheetTitle>
        </SheetHeader>
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="mt-6 flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="id">Tool ID</Label>
              <Input id="id" placeholder="tool-uuid" {...register("id")} />
              {errors.id && <p className="text-xs text-destructive">{errors.id.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="version">Version</Label>
              <Input id="version" placeholder="1.0.0" {...register("version")} />
              {errors.version && <p className="text-xs text-destructive">{errors.version.message}</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="query-database" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} placeholder="What this tool does..." {...register("description")} />
            {errors.description && <p className="text-xs text-destructive">{errors.description.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Auth Level</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" value="read" {...register("auth_level")} />
                Read
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" value="mutating" {...register("auth_level")} />
                Mutating
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" {...register("sandbox_required")} />
            Requires Sandbox
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registered_by">Registered By</Label>
            <Input id="registered_by" placeholder="platform-admin" {...register("registered_by")} />
            {errors.registered_by && <p className="text-xs text-destructive">{errors.registered_by.message}</p>}
          </div>

          {mutation.error && (
            <p className="text-xs text-destructive">{String(mutation.error)}</p>
          )}

          <Button type="submit" disabled={mutation.isPending} className="mt-2">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Register
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export default function ToolsPage() {
  const qc = useQueryClient();
  const { data: tools, isLoading, isError } = useQuery({
    queryKey: ["tools"],
    queryFn: () => toolsApi.list(),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) =>
      toolsApi.transition(id, { target_state: "approved", actor: "studio-user" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tools"] }),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Tool Registry</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Primitive, stateless operations available to skills
          </p>
        </div>
        <RegisterToolSheet onCreated={() => qc.invalidateQueries({ queryKey: ["tools"] })} />
      </div>

      <Separator className="mb-6" />

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive py-4">Failed to load tools. Is tool-registry running on :8086?</p>
      )}

      {tools && tools.length === 0 && (
        <div className="text-center py-20 text-muted-foreground text-sm">
          No tools registered yet. Click <strong>Register Tool</strong> to add one.
        </div>
      )}

      {tools && tools.length > 0 && (
        <div className="flex flex-col gap-2">
          {tools.map((tool: ToolSpec) => (
            <div
              key={tool.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <StatusIcon status={tool.status} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium font-mono">{tool.name}</span>
                    <span className="text-xs text-muted-foreground">v{tool.version}</span>
                    <Badge variant={tool.auth_level === "mutating" ? "destructive" : "outline"} className="text-xs">
                      {tool.auth_level}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground truncate mt-0.5">{tool.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4 shrink-0">
                <StatusBadge status={tool.status} />
                {tool.status === "pending_review" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => approveMutation.mutate(tool.id)}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending && approveMutation.variables === tool.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : "Approve"
                    }
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
