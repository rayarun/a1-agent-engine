"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Play, Loader2, AlertCircle } from "lucide-react";
import { adminApi } from "@/lib/api";

export default function SystemAgentsPage() {
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    version: "",
    system_prompt: "",
    model: "",
    max_iterations: 10,
    memory_budget_mb: 512,
    status: "active",
  });

  const { data: agentsData, isLoading, isError, error } = useQuery({
    queryKey: ["system-agents"],
    queryFn: () => adminApi.listSystemAgents(),
  });

  const agents = agentsData?.agents || [];
  const selectedAgent = useMemo(
    () => agents.find((a: any) => a.id === selectedAgentId) || agents[0],
    [agents, selectedAgentId]
  );

  const updateMutation = useMutation({
    mutationFn: async (data: typeof editForm) => {
      if (!selectedAgent) return;
      return adminApi.updateSystemAgent(selectedAgent.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-agents"] });
      setIsEditOpen(false);
    },
  });

  function handleEditAgent() {
    if (!selectedAgent) return;
    setEditForm({
      name: selectedAgent.name,
      version: selectedAgent.version,
      system_prompt: selectedAgent.system_prompt,
      model: selectedAgent.model,
      max_iterations: selectedAgent.max_iterations,
      memory_budget_mb: selectedAgent.memory_budget_mb,
      status: selectedAgent.status,
    });
    setIsEditOpen(true);
  }

  async function handleSaveManifest() {
    await updateMutation.mutateAsync(editForm);
  }

  function handleDeploy(agentId: string) {
    // TODO: Implement deployment transition in Phase 5
    console.log("Deploy agent:", agentId);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">System Agents</h1>
        <p className="text-muted-foreground mt-1">
          Manage platform-level system agents and their manifests
        </p>
      </div>

      {isError && (
        <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
          <AlertCircle className="h-4 w-4" />
          <span>{error instanceof Error ? error.message : "Failed to load system agents"}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="lg:col-span-1">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/50">
              <h2 className="font-semibold text-sm">System Agents</h2>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : agents.length > 0 ? (
              <div className="divide-y divide-border">
                {agents.map((agent: any) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`w-full text-left p-3 transition-colors ${
                      selectedAgent?.id === agent.id
                        ? "bg-primary/10 border-l-2 border-primary"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="font-medium text-sm">{agent.name}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          agent.status === "active"
                            ? "bg-green-500/15 text-green-400"
                            : agent.status === "staged"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-gray-500/15 text-gray-400"
                        }`}
                      >
                        {agent.status}
                      </span>
                      <span className="text-xs text-muted-foreground">{agent.version}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No system agents found
              </div>
            )}
          </div>
        </div>

        {/* Agent Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selectedAgent ? (
            <>
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{selectedAgent.name}</h2>
                    <p className="text-sm text-muted-foreground font-mono mt-1">
                      {selectedAgent.id}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      selectedAgent.status === "active"
                        ? "bg-green-500/15 text-green-400"
                        : selectedAgent.status === "staged"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-gray-500/15 text-gray-400"
                    }`}
                  >
                    {selectedAgent.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-border">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Model</p>
                    <p className="text-sm font-mono">{selectedAgent.model}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Version</p>
                    <p className="text-sm font-mono">{selectedAgent.version}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Max Iterations</p>
                    <p className="text-sm">{selectedAgent.max_iterations}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Memory Budget</p>
                    <p className="text-sm">{selectedAgent.memory_budget_mb}MB</p>
                  </div>
                </div>

                <div className="py-4">
                  <p className="text-xs text-muted-foreground mb-2">System Prompt</p>
                  <div className="bg-muted/50 rounded-md p-3 text-sm font-mono text-xs max-h-40 overflow-y-auto">
                    {selectedAgent.system_prompt}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleEditAgent}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit Manifest
                  </button>
                  <button
                    onClick={() => handleDeploy(selectedAgent.id)}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
                  >
                    <Play className="h-4 w-4" />
                    Deploy
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground">
              {isLoading ? "Loading agents..." : "Select an agent to view details"}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {isEditOpen && selectedAgent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit Agent Manifest</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Version</label>
                  <input
                    type="text"
                    value={editForm.version}
                    onChange={(e) => setEditForm({ ...editForm, version: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Model</label>
                  <input
                    type="text"
                    value={editForm.model}
                    onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">System Prompt</label>
                <textarea
                  value={editForm.system_prompt}
                  onChange={(e) => setEditForm({ ...editForm, system_prompt: e.target.value })}
                  rows={6}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Max Iterations</label>
                  <input
                    type="number"
                    value={editForm.max_iterations}
                    onChange={(e) => setEditForm({ ...editForm, max_iterations: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Memory Budget (MB)</label>
                  <input
                    type="number"
                    value={editForm.memory_budget_mb}
                    onChange={(e) => setEditForm({ ...editForm, memory_budget_mb: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="draft">Draft</option>
                  <option value="staged">Staged</option>
                  <option value="active">Active</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 pt-6 justify-end">
              <button
                onClick={() => setIsEditOpen(false)}
                className="px-4 py-2 bg-muted text-foreground rounded-md text-sm font-medium hover:bg-muted/80"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveManifest}
                disabled={updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
