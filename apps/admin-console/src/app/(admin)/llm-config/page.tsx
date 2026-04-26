"use client";

import { useState } from "react";
import { Loader2, AlertCircle, Save, Eye, EyeOff } from "lucide-react";

export default function LLMConfigPage() {
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [config, setConfig] = useState({
    mode: "anthropic",
    anthropic_base_url: "https://api.anthropic.com",
    anthropic_api_key: "sk-ant-****",
    openai_api_key: "",
  });

  async function handleSave() {
    setIsSaving(true);
    setSaveError("");
    setSaveSuccess(false);

    try {
      // TODO: Call admin API to save config
      await new Promise((resolve) => setTimeout(resolve, 500));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setIsSaving(false);
    }
  }

  const modes = [
    { id: "mock", label: "Mock (Development)", description: "Local mock LLM for testing" },
    { id: "anthropic", label: "Anthropic", description: "Anthropic Claude via proxy" },
    { id: "openai", label: "OpenAI", description: "OpenAI GPT models" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">LLM Configuration</h1>
        <p className="text-muted-foreground mt-1">
          Configure LLM providers and model access control
        </p>
      </div>

      {/* Platform LLM Configuration */}
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Platform LLM Configuration</h2>

          {/* Mode Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-3">LLM Mode</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {modes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => setConfig({ ...config, mode: mode.id })}
                  className={`p-4 rounded-lg border-2 text-left transition-colors ${
                    config.mode === mode.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <p className="font-medium text-sm">{mode.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{mode.description}</p>
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
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              {isSaving ? (
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
