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
    queryKey: ["llm-config"],
    queryFn: () => adminApi.getLLMConfig(),
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
      return adminApi.putLLMConfig({
        anthropic_base_url: config.anthropic_base_url,
        anthropic_api_key: config.anthropic_api_key && !config.anthropic_api_key.startsWith("•") ? config.anthropic_api_key : undefined,
        openai_api_key: config.openai_api_key && !config.openai_api_key.startsWith("•") ? config.openai_api_key : undefined,
        google_api_key: config.google_api_key && !config.google_api_key.startsWith("•") ? config.google_api_key : undefined,
      });
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

      {/* Setup Guide for Corporate Proxy */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
        <h2 className="text-sm font-semibold text-amber-300 mb-2">🏢 To use Corporate liteLLM Proxy:</h2>
        <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
          <li>Select <strong>"Multi-Provider"</strong> mode below</li>
          <li>Set <strong>LLM Proxy URL</strong> to your corporate proxy: <span className="font-mono text-amber-400">https://llm-inference.internal.angelone.in/v1/messages</span></li>
          <li>Set <strong>API Key</strong> to your corporate authentication key</li>
          <li>Click <strong>Save Configuration</strong></li>
          <li>Go to <strong>Model Routes</strong> to configure which models route where (optional)</li>
        </ol>
      </div>

      {/* Platform LLM Configuration */}
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Platform LLM Configuration</h2>

          {/* Mode Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-3">LLM Mode</label>
            <p className="text-xs text-muted-foreground mb-3">Select "Multi-Provider" for corporate proxies or multiple LLM sources</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setConfig({ ...config, mode: mode.id })}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    config.mode === mode.id
                      ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm">{mode.label}</p>
                    {config.mode === mode.id && <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">Active</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Anthropic Configuration */}
          {config.mode === "anthropic" && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div>
                <label className="block text-sm font-medium mb-2">Anthropic Base URL</label>
                <input
                  type="text"
                  value={config.anthropic_base_url}
                  onChange={(e) =>
                    setConfig({ ...config, anthropic_base_url: e.target.value })
                  }
                  placeholder="https://api.anthropic.com"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty to use Anthropic's official endpoint
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Anthropic API Key</label>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <input
                  type={showApiKey ? "text" : "password"}
                  value={config.anthropic_api_key}
                  onChange={(e) =>
                    setConfig({ ...config, anthropic_api_key: e.target.value })
                  }
                  placeholder="sk-ant-..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
            </div>
          )}

          {/* OpenAI Configuration */}
          {config.mode === "openai" && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">OpenAI API Key</label>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <input
                  type={showApiKey ? "text" : "password"}
                  value={config.openai_api_key}
                  onChange={(e) =>
                    setConfig({ ...config, openai_api_key: e.target.value })
                  }
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
            </div>
          )}

          {/* Multi-Provider Configuration */}
          {config.mode === "multi-provider" && (
            <div className="space-y-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-4">
                Configure your unified LLM gateway. Can be a corporate proxy, liteLLM instance, or any multi-provider gateway that routes all models internally.
              </p>

              <div>
                <label className="block text-sm font-medium mb-2">LLM Proxy URL</label>
                <input
                  type="text"
                  value={config.anthropic_base_url}
                  onChange={(e) =>
                    setConfig({ ...config, anthropic_base_url: e.target.value })
                  }
                  placeholder="https://llm-inference.internal.angelone.in/v1/messages"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  URL to your unified LLM gateway
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">Authentication Key</label>
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                <input
                  type={showApiKey ? "text" : "password"}
                  value={config.anthropic_api_key}
                  onChange={(e) =>
                    setConfig({ ...config, anthropic_api_key: e.target.value })
                  }
                  placeholder="Your gateway authentication key"
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Single authentication key for the gateway (handles all model routing internally)
                </p>
              </div>

              <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3 mt-4">
                <p className="text-xs text-green-400">
                  <strong>✓ Your gateway handles:</strong> All model routing, provider selection, and authentication
                </p>
              </div>
            </div>
          )}

          {/* Messages */}
          {saveError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive text-sm rounded-md mt-4">
              <AlertCircle className="h-4 w-4" />
              <span>{saveError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 text-green-400 text-sm rounded-md mt-4">
              <span>✓ Configuration saved successfully</span>
            </div>
          )}

          {/* Save Button */}
          <div className="flex gap-2 pt-6">
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending || isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </div>

        {/* Advanced: Model Routes */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Advanced: Model Routes</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Configure custom model-to-endpoint mappings for fine-grained control
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

        {/* Model Access Control */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Model Access Control</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left py-3 px-4 font-medium">Model ID</th>
                  <th className="text-left py-3 px-4 font-medium">Model Name</th>
                  <th className="text-left py-3 px-4 font-medium">Global Status</th>
                  <th className="text-left py-3 px-4 font-medium">Tenant Access</th>
                  <th className="text-center py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet", status: "enabled", access: "3 tenants" },
                  { id: "claude-3-opus", name: "Claude 3 Opus", status: "enabled", access: "All" },
                  { id: "gpt-4", name: "GPT-4", status: "disabled", access: "-" },
                ].map((model) => (
                  <tr key={model.id} className="border-b border-border hover:bg-muted/30">
                    <td className="py-3 px-4 font-mono text-xs">{model.id}</td>
                    <td className="py-3 px-4">{model.name}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          model.status === "enabled"
                            ? "bg-green-500/15 text-green-400"
                            : "bg-orange-500/15 text-orange-400"
                        }`}
                      >
                        {model.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">{model.access}</td>
                    <td className="py-3 px-4 text-center">
                      <button className="px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted">
                        Manage Access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Click "Manage Access" to configure per-tenant model allowlists and token limits.
          </p>
        </div>
      </div>
    </div>
  );
}
