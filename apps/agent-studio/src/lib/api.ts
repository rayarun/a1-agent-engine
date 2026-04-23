const TENANT_ID = process.env.NEXT_PUBLIC_TENANT_ID ?? "default-tenant";

const TOOL_REGISTRY =
  process.env.NEXT_PUBLIC_TOOL_REGISTRY_URL ?? "http://localhost:8086";
const SKILL_CATALOG =
  process.env.NEXT_PUBLIC_SKILL_CATALOG_URL ?? "http://localhost:8087";
const AGENT_REGISTRY =
  process.env.NEXT_PUBLIC_AGENT_REGISTRY_URL ?? "http://localhost:8088";
const API_GATEWAY =
  process.env.NEXT_PUBLIC_API_GATEWAY_URL ?? "http://localhost:8080";

async function req<T>(base: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Tenant-ID": TENANT_ID,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// Tools
export const toolsApi = {
  list: (status?: string) =>
    req<import("./types").ToolSpec[]>(
      TOOL_REGISTRY,
      `/api/v1/tools${status ? `?status=${status}` : ""}`
    ),
  get: (id: string) =>
    req<import("./types").ToolSpec>(TOOL_REGISTRY, `/api/v1/tools/${id}`),
  create: (body: Partial<import("./types").ToolSpec>) =>
    req<import("./types").ToolSpec>(TOOL_REGISTRY, "/api/v1/tools", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<import("./types").ToolSpec>) =>
    req<import("./types").ToolSpec>(TOOL_REGISTRY, `/api/v1/tools/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  transition: (id: string, body: import("./types").TransitionRequest) =>
    req<import("./types").ToolSpec>(
      TOOL_REGISTRY,
      `/api/v1/tools/${id}/transition`,
      { method: "POST", body: JSON.stringify(body) }
    ),
};

// Skills
export const skillsApi = {
  list: (status?: string) =>
    req<import("./types").SkillManifest[]>(
      SKILL_CATALOG,
      `/api/v1/skills${status ? `?status=${status}` : ""}`
    ),
  get: (id: string) =>
    req<import("./types").SkillManifest>(SKILL_CATALOG, `/api/v1/skills/${id}`),
  create: (body: Partial<import("./types").SkillManifest>) =>
    req<import("./types").SkillManifest>(SKILL_CATALOG, "/api/v1/skills", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<import("./types").SkillManifest>) =>
    req<import("./types").SkillManifest>(SKILL_CATALOG, `/api/v1/skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  transition: (id: string, body: import("./types").TransitionRequest) =>
    req<import("./types").SkillManifest>(
      SKILL_CATALOG,
      `/api/v1/skills/${id}/transition`,
      { method: "POST", body: JSON.stringify(body) }
    ),
};

// Agents
export const agentsApi = {
  list: (status?: string) =>
    req<import("./types").AgentRecord[]>(
      AGENT_REGISTRY,
      `/api/v1/agents${status ? `?status=${status}` : ""}`
    ),
  get: (id: string) =>
    req<import("./types").AgentRecord>(AGENT_REGISTRY, `/api/v1/agents/${id}`),
  create: (body: Partial<import("./types").AgentManifest>) =>
    req<import("./types").AgentRecord>(AGENT_REGISTRY, "/api/v1/agents", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Partial<import("./types").AgentManifest>) =>
    req<import("./types").AgentRecord>(
      AGENT_REGISTRY,
      `/api/v1/agents/${id}`,
      { method: "PUT", body: JSON.stringify(body) }
    ),
  transition: (id: string, body: import("./types").TransitionRequest) =>
    req<import("./types").AgentRecord>(
      AGENT_REGISTRY,
      `/api/v1/agents/${id}/transition`,
      { method: "POST", body: JSON.stringify(body) }
    ),
};

// Chat SSE (api-gateway)
export function openChatStream(
  agentId: string,
  message: string,
  tenantId: string = TENANT_ID
): EventSource {
  const url = `${API_GATEWAY}/api/v1/agents/${agentId}/chat?tenant_id=${encodeURIComponent(tenantId)}&message=${encodeURIComponent(message)}`;
  return new EventSource(url);
}
