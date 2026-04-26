"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { llmConfigApi, LLMConfig, LLMConfigUpdate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const PRESETS = {
  mock: { label: "Mock (Testing)", url: "", key: "" },
  anthropic: { label: "Public Anthropic", url: "https://api.anthropic.com/v1/messages", key: "" },
  angelone: { label: "Internal (AngelOne)", url: "https://llm-inference.internal.angelone.in/v1/messages", key: "" },
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [formData, setFormData] = useState<LLMConfigUpdate>({ anthropic_base_url: "", anthropic_api_key: "" });

  const { data: config, isLoading, refetch } = useQuery({
    queryKey: ["llmConfig"],
    queryFn: () => llmConfigApi.get(),
  });

  useEffect(() => {
    if (config) {
      setFormData({ anthropic_base_url: config.anthropic_base_url, anthropic_api_key: "" });
    }
  }, [config]);

  const updateMutation = useMutation({
    mutationFn: (data: LLMConfigUpdate) => llmConfigApi.update(data),
    onSuccess: (newConfig) => {
      queryClient.setQueryData(["llmConfig"], newConfig);
      setFormData({ anthropic_base_url: newConfig.anthropic_base_url, anthropic_api_key: "" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const applyPreset = (preset: keyof typeof PRESETS) => {
    const p = PRESETS[preset];
    setFormData({ anthropic_base_url: p.url, anthropic_api_key: p.key });
  };

  const getModeColor = (mode?: string) => {
    const colors = {
      mock: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
      anthropic: "bg-green-500/10 text-green-700 border-green-200",
      custom: "bg-blue-500/10 text-blue-700 border-blue-200",
    };
    return colors[mode as keyof typeof colors] || "bg-gray-500/10 text-gray-700 border-gray-200";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full font-mono">
      <div className="px-4 py-3 border-b border-border/50 shrink-0">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">Configure LLM Gateway backend</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Current Mode</Label>
            <div className={`inline-flex ${getModeColor(config?.mode)} px-3 py-1 rounded border font-mono text-sm`}>
              {config?.mode === "mock" && "🧪 Mock (No API Calls)"}
              {config?.mode === "anthropic" && "✓ Public Anthropic API"}
              {config?.mode === "custom" && "→ Custom Endpoint"}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label className="text-xs font-semibold">Quick Presets</Label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(PRESETS).map(([key, preset]) => (
                <Button key={key} variant="outline" size="sm" onClick={() => applyPreset(key as keyof typeof PRESETS)} className="text-xs font-mono">
                  {preset.label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Presets auto-fill the form. You need to enter an API key for real endpoints.</p>
          </div>

          <Separator />

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url" className="text-xs font-semibold">Anthropic Base URL</Label>
              <Input
                id="url"
                placeholder="https://api.anthropic.com/v1/messages"
                value={formData.anthropic_base_url}
                onChange={(e) => setFormData({ ...formData, anthropic_base_url: e.target.value })}
                className="text-xs font-mono"
              />
              <p className="text-xs text-muted-foreground">Leave empty for public API. Custom URL for internal endpoints.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="key" className="text-xs font-semibold">Anthropic API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="key"
                  type={showKey ? "text" : "password"}
                  placeholder={config?.anthropic_key_set ? "••••••••" : "sk-ant-..."}
                  value={formData.anthropic_api_key}
                  onChange={(e) => setFormData({ ...formData, anthropic_api_key: e.target.value })}
                  className="text-xs font-mono flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => setShowKey(!showKey)} className="text-xs">
                  {showKey ? "Hide" : "Show"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {config?.anthropic_key_set ? "Key is set. Leave blank to keep it." : "Enter your API key to enable real LLM calls."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 bg-muted/30 rounded border border-border/50 text-xs">
              <div className="flex items-center gap-2">
                {config?.anthropic_key_set ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-yellow-500" />}
                <span>Anthropic Key: {config?.anthropic_key_set ? "Set" : "Not Set"}</span>
              </div>
              <div className="flex items-center gap-2">
                {config?.openai_key_set ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <AlertCircle className="h-4 w-4 text-yellow-500" />}
                <span>OpenAI Key: {config?.openai_key_set ? "Set" : "Not Set"}</span>
              </div>
            </div>

            <Button type="submit" disabled={updateMutation.isPending} className="w-full">
              {updateMutation.isPending ? <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </> : "Save Configuration"}
            </Button>

            {updateMutation.isSuccess && <div className="p-3 bg-green-500/10 border border-green-200 rounded text-xs text-green-700">✓ Updated</div>}
            {updateMutation.isError && <div className="p-3 bg-red-500/10 border border-red-200 rounded text-xs text-red-700">✗ Error: {(updateMutation.error as Error).message}</div>}
          </form>

          <Separator />

          <div className="bg-muted/20 border border-border/50 rounded p-4 space-y-2 text-xs">
            <h3 className="font-semibold">LLM Gateway Modes</h3>
            <ul className="space-y-1 text-muted-foreground">
              <li><strong>Mock:</strong> No API key. Deterministic responses for testing.</li>
              <li><strong>Public Anthropic:</strong> Official API. Requires valid key.</li>
              <li><strong>Custom:</strong> Internal endpoint. Air-gapped environments.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
