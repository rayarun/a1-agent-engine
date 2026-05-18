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

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Edit2, AlertCircle } from "lucide-react";
import { adminApi } from "@/lib/api";

interface ModelRoute {
  id: string;
  model_pattern: string;
  endpoint_url: string;
  provider_type: string;
  api_key?: string;
  status: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export default function ModelRoutesPage() {
  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [liteLLMConfig, setLiteLLMConfig] = useState("");

  const [formData, setFormData] = useState({
    model_pattern: "",
    endpoint_url: "",
    provider_type: "anthropic",
    api_key: "",
    description: "",
  });

  const { data: routesData, isLoading } = useQuery({
    queryKey: ["model-routes"],
    queryFn: () => adminApi.listModelRoutes(),
  });

  useEffect(() => {
    if (routesData?.routes) {
      setRoutes(routesData.routes);
    }
  }, [routesData]);

  const createMutation = useMutation({
    mutationFn: async () => {
      return adminApi.createModelRoute({
        model_pattern: formData.model_pattern,
        endpoint_url: formData.endpoint_url,
        provider_type: formData.provider_type,
        api_key: formData.api_key || undefined,
        description: formData.description || undefined,
      });
    },
    onSuccess: (newRoute) => {
      setRoutes([...routes, newRoute]);
      resetForm();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to create route");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) throw new Error("No route selected");
      return adminApi.updateModelRoute(editingId, {
        model_pattern: formData.model_pattern,
        endpoint_url: formData.endpoint_url,
        provider_type: formData.provider_type,
        api_key: formData.api_key || undefined,
        description: formData.description || undefined,
      });
    },
    onSuccess: (updated) => {
      setRoutes(routes.map((r) => (r.id === editingId ? updated : r)));
      resetForm();
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : "Failed to update route");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteModelRoute(id),
    onSuccess: (_, id) => {
      setRoutes(routes.filter((r) => r.id !== id));
    },
  });

  const fetchConfig = async () => {
    try {
      const config = await adminApi.getLiteLLMConfig();
      setLiteLLMConfig(config);
      setShowConfig(true);
    } catch (err) {
      setFormError("Failed to fetch liteLLM config");
    }
  };

  const resetForm = () => {
    setFormData({
      model_pattern: "",
      endpoint_url: "",
      provider_type: "anthropic",
      api_key: "",
      description: "",
    });
    setEditingId(null);
    setShowForm(false);
    setFormError("");
  };

  const handleEdit = (route: ModelRoute) => {
    setFormData({
      model_pattern: route.model_pattern,
      endpoint_url: route.endpoint_url,
      provider_type: route.provider_type,
      api_key: "",
      description: route.description || "",
    });
    setEditingId(route.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!formData.model_pattern || !formData.endpoint_url) {
      setFormError("Pattern and URL are required");
      return;
    }

    if (editingId) {
      await updateMutation.mutateAsync();
    } else {
      await createMutation.mutateAsync();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Model Routes</h1>
        <p className="text-muted-foreground mt-1">
          Configure model-to-endpoint mappings for dynamic LLM routing
        </p>
      </div>

      {/* Config Viewer */}
      {showConfig && (
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Generated liteLLM Config</h2>
            <button
              onClick={() => setShowConfig(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
          <pre className="bg-muted/50 border border-border rounded p-3 text-xs overflow-auto max-h-96">
            {liteLLMConfig}
          </pre>
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? "Edit Route" : "Create New Route"}
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Model Pattern (e.g., claude-*, gpt-*, gemma:*)
              </label>
              <input
                type="text"
                value={formData.model_pattern}
                onChange={(e) =>
                  setFormData({ ...formData, model_pattern: e.target.value })
                }
                placeholder="claude-*"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Endpoint URL
              </label>
              <input
                type="text"
                value={formData.endpoint_url}
                onChange={(e) =>
                  setFormData({ ...formData, endpoint_url: e.target.value })
                }
                placeholder="https://api.anthropic.com"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Provider Type
              </label>
              <select
                value={formData.provider_type}
                onChange={(e) =>
                  setFormData({ ...formData, provider_type: e.target.value })
                }
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="google">Google</option>
                <option value="ollama">Ollama</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                API Key (optional)
              </label>
              <input
                type="password"
                value={formData.api_key}
                onChange={(e) =>
                  setFormData({ ...formData, api_key: e.target.value })
                }
                placeholder="sk-..."
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty if endpoint requires no authentication
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Description (optional)
              </label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="e.g., Production Anthropic endpoint"
                className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            {formError && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {createMutation.isPending || updateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Route"
                )}
              </button>
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Routes Table */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Routes</h2>
          <div className="flex gap-2">
            <button
              onClick={fetchConfig}
              className="px-3 py-2 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80"
            >
              View Config
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" />
              New Route
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : routes.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            No model routes configured. Create one to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Pattern</th>
                  <th className="text-left py-3 px-4 font-medium">Endpoint</th>
                  <th className="text-left py-3 px-4 font-medium">Provider</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-center py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr
                    key={route.id}
                    className="border-b border-border hover:bg-muted/30"
                  >
                    <td className="py-3 px-4 font-mono text-xs">{route.model_pattern}</td>
                    <td className="py-3 px-4 text-xs truncate max-w-xs">
                      {route.endpoint_url}
                    </td>
                    <td className="py-3 px-4 capitalize">{route.provider_type}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          route.status === "active"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {route.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleEdit(route)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(route.id)}
                          className="p-1 text-destructive hover:text-destructive/80"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
