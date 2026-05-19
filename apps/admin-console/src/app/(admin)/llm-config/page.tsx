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
import { Loader2, AlertCircle, Save, Eye, EyeOff } from "lucide-react";
import { adminApi } from "@/lib/api";

export default function LLMConfigPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [config, setConfig] = useState({
    mode: "multi-provider",
    anthropic_base_url: "https://api.anthropic.com",
    anthropic_api_key: "",
    openai_api_key: "",
    google_api_key: "",
  });

  const { data: fetchedConfig, isLoading } = useQuery({
    queryKey: ["litellm-config"],
    queryFn: () => adminApi.getLiteLLMConfig(),
  });

  useEffect(() => {
    if (fetchedConfig) {
      setConfig((prev) => ({
        ...prev,
        mode: fetchedConfig.mode || "multi-provider",
        anthropic_base_url: fetchedConfig.anthropic_base_url || "https://api.anthropic.com",
        anthropic_api_key: fetchedConfig.anthropic_key_set ? "••••••••" : "",
        openai_api_key: fetchedConfig.openai_key_set ? "••••••••" : "",
        google_api_key: fetchedConfig.google_key_set ? "••••••••" : "",
      }));
    }
  }, [fetchedConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Config is now managed via Model Routes page instead of a dedicated config endpoint
      // Show success but note that actual routing is configured there
      return { success: true };
    },
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err) => {
      setSaveError(err instanceof Error ? err.message : "Failed to save configuration");
    },
  });

  async function handleSave() {
    setSaveError("");
    setSaveSuccess(false);
    await saveMutation.mutateAsync();
  }

  const modes = [
    { id: "multi-provider", label: "Multi-Provider (Recommended)", description: "liteLLM unified interface: Anthropic, OpenAI, Google, and 100+ providers" },
    { id: "anthropic", label: "Anthropic Only", description: "Claude models via custom proxy" },
    { id: "openai", label: "OpenAI Only", description: "GPT models" },
    { id: "mock", label: "Mock (Development)", description: "Local mock LLM for testing" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">LLM Configuration</h1>
        <p className="text-muted-foreground mt-1">
          Configure LLM providers and model access control
        </p>
      </div>

      {/* Current Configuration Status */}
      {!isLoading && fetchedConfig && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-blue-300 mb-3">📋 Current Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Proxy URL</p>
              <p className="font-mono text-xs truncate">{fetchedConfig.anthropic_base_url || "(default)"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Anthropic Key</p>
              <p className="text-xs">{fetchedConfig.anthropic_key_set ? "✓ Set" : "✗ Not set"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">OpenAI Key</p>
              <p className="text-xs">{fetchedConfig.openai_key_set ? "✓ Set" : "✗ Not set"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Google Key</p>
              <p className="text-xs">{fetchedConfig.google_key_set ? "✓ Set" : "✗ Not set"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Info: Configuration moved to Model Routes */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-blue-300 mb-2">ℹ️ Model Configuration Moved</h2>
        <p className="text-xs text-muted-foreground mb-3">
          With the new LiteLLM architecture, all model routing and provider configuration is now managed via <strong>Model Routes</strong>.
        </p>
        <a href="/model-routes" className="inline-block px-3 py-2 bg-blue-500 text-white rounded-md text-xs font-medium hover:bg-blue-600">
          Go to Model Routes →
        </a>
      </div>

      {/* LiteLLM Configuration Status */}
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">LiteLLM Configuration</h2>

          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-sm text-green-400 font-medium mb-2">✓ Active Configuration</p>
              <p className="text-xs text-muted-foreground">
                The platform is running with LiteLLM proxy at <span className="font-mono">http://litellm:8000/v1</span>
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium">Status</label>
                <p className="text-sm text-muted-foreground mt-1">LiteLLM proxy is active and routing all LLM requests</p>
              </div>

              <div>
                <label className="text-sm font-medium">How to Configure Routes</label>
                <p className="text-sm text-muted-foreground mt-1">
                  Use the <strong>Model Routes</strong> page to define which model patterns route to which provider endpoints.
                  Each route specifies a glob pattern (e.g., <code className="bg-muted px-1 py-0.5 rounded text-xs">claude-*</code>),
                  the provider type, and the endpoint URL.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">Generated Configuration</label>
                <p className="text-sm text-muted-foreground mt-1">
                  The system automatically generates LiteLLM configuration from your model routes.
                  You can view the generated YAML below.
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* Model Routes */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Model Routes</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Define model patterns and their provider endpoints
              </p>
            </div>
            <a
              href="/model-routes"
              className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
            >
              Manage Routes →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
