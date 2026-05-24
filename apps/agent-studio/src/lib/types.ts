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
  scope?: "tenant" | "system";
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

export interface MCPServer {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  scope: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type AgentFramework = "pydantic-ai" | "anthropic-agents" | "google-adk" | "openai-agents";
export type ExecutionMode = "temporal" | "direct";

export interface AgentManifest {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  system_prompt: string;
  skills: SkillRef[];
  tools?: ToolRef[];
  model: string;
  max_iterations: number;
  memory_budget_mb: number;
  mcp_servers?: string[];
  framework: AgentFramework;
  execution_mode?: ExecutionMode;
  native_tools?: Record<string, unknown>;
}

export interface AgentRecord {
  id: string;
  tenant_id: string;
  name: string;
  version: string;
  system_prompt: string;
  skills: SkillRef[];
  tools?: ToolRef[];
  model: string;
  max_iterations: number;
  memory_budget_mb: number;
  mcp_servers?: string[];
  framework: AgentFramework;
  native_tools?: Record<string, unknown>;
  status: ResourceStatus;
  created_at: string;
}

export interface TransitionRequest {
  target_state: string;
  actor: string;
  reason?: string;
}

export interface ChatEvent {
  type: "thinking" | "tool_call" | "tool_result" | "text" | "error" | "done" | "approval";
  content?: string;
  tool_name?: string;
  tool_args?: unknown;
  tool_result?: unknown;
  timestamp?: string;
  approval_id?: string;
  reason?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  events?: ChatEvent[];
  streaming?: boolean;
  metadata?: Record<string, unknown>;
}

export interface KGGraph {
  id: string;
  tenant_id: string;
  name: string;
  domain?: string;
  description?: string;
  scope: string;
  schema?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KGNode {
  id: string;
  graph_id: string;
  tenant_id: string;
  node_type: string;
  label: string;
  properties?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KGEdge {
  id: string;
  graph_id: string;
  tenant_id: string;
  from_node_id: string;
  to_node_id: string;
  relationship_type: string;
  properties?: Record<string, unknown>;
  weight?: number;
  created_at: string;
  updated_at: string;
}
