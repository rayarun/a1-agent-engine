export type ResourceStatus =
  | "draft"
  | "staged"
  | "active"
  | "paused"
  | "archived"
  | "pending_review"
  | "approved"
  | "deprecated";

export type AuthLevel = "read" | "mutating";

export interface ToolSpec {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  description: string;
  auth_level: AuthLevel;
  sandbox_required: boolean;
  input_schema?: unknown;
  output_schema?: unknown;
  status: ResourceStatus;
  registered_by: string;
  created_at: string;
}

export interface ToolRef {
  name: string;
  version: string;
}

export interface HookSpec {
  phase: "pre" | "post";
  type: "audit_log" | "cost_meter" | "hitl_intercept" | "rate_limit";
  config?: Record<string, unknown>;
}

export interface SkillManifest {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  description: string;
  tools: ToolRef[];
  sop: string;
  mutating: boolean;
  approval_required: boolean;
  hooks?: HookSpec[];
  status: ResourceStatus;
  published_by: string;
  created_at: string;
}

export interface SkillRef {
  name: string;
  version: string;
}

export interface AgentManifest {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  system_prompt: string;
  skills: SkillRef[];
  model: string;
  max_iterations: number;
  memory_budget_mb: number;
}

export interface AgentRecord {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  system_prompt: string;
  skills: SkillRef[];
  model: string;
  max_iterations: number;
  memory_budget_mb: number;
  status: ResourceStatus;
  created_at: string;
}

export interface TransitionRequest {
  target_state: string;
  actor: string;
  reason?: string;
}

export interface ChatEvent {
  type: "thinking" | "tool_call" | "tool_result" | "text" | "error" | "done";
  content?: string;
  tool_name?: string;
  tool_args?: unknown;
  tool_result?: unknown;
  timestamp?: string;
}
