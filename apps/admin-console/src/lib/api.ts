const API_BASE_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || "http://localhost:8089";

function getAuthHeader() {
  if (typeof window === "undefined") return {};
  const key = sessionStorage.getItem("admin_api_key");
  if (!key) return {};
  return { Authorization: `Bearer ${key}` };
}

async function request(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authHeaders = getAuthHeader();
  if (authHeaders.Authorization) {
    headers.Authorization = authHeaders.Authorization;
  }

  const config: RequestInit = {
    method,
    headers,
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(url, config);
  return response;
}

export const adminApi = {
  async verifyAuth(apiKey: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/auth/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    return response.json();
  },

  async listTenants(): Promise<any> {
    const response = await request("GET", "/api/v1/admin/tenants");
    if (!response.ok) throw new Error("Failed to fetch tenants");
    return response.json();
  },

  async createTenant(data: {
    tenant_id: string;
    display_name: string;
    max_concurrent_workflows?: number;
    token_budget_monthly?: number;
  }): Promise<any> {
    const response = await request("POST", "/api/v1/admin/tenants", data);
    if (!response.ok) throw new Error("Failed to create tenant");
    return response.json();
  },

  async getTenant(tenantId: string): Promise<any> {
    const response = await request("GET", `/api/v1/admin/tenants/${tenantId}`);
    if (!response.ok) throw new Error("Failed to fetch tenant");
    return response.json();
  },

  async updateTenantQuota(
    tenantId: string,
    data: { max_concurrent_workflows?: number; token_budget_monthly?: number }
  ): Promise<any> {
    const response = await request(
      "PUT",
      `/api/v1/admin/tenants/${tenantId}/quota`,
      data
    );
    if (!response.ok) throw new Error("Failed to update tenant quota");
    return response.json();
  },

  async updateTenantStatus(tenantId: string, status: "active" | "suspended"): Promise<any> {
    const response = await request(
      "PUT",
      `/api/v1/admin/tenants/${tenantId}/status`,
      { status }
    );
    if (!response.ok) throw new Error("Failed to update tenant status");
    return response.json();
  },
};
