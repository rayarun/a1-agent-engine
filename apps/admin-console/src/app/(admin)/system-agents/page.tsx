"use client";

import { useState } from "react";
import { Edit2, Play, Copy } from "lucide-react";

export default function SystemAgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState(0);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editedManifest, setEditedManifest] = useState("");

  const agents = [
    {
      id: "manifest-assistant",
      name: "Manifest Assistant",
      status: "active",
      model: "claude-3-5-sonnet",
      system_prompt: "You are an expert AI assistant specializing in creating, validating, and refactoring agent manifests...",
      version: "1.0.0",
      last_deployed: "2026-04-20T14:32:00Z",
    },
    {
      id: "system-monitor",
      name: "System Monitor",
      status: "staged",
      model: "claude-3-5-sonnet",
      system_prompt: "You are a system monitoring expert that analyzes platform health and performance metrics...",
      version: "0.9.0",
      last_deployed: "2026-04-15T09:15:00Z",
    },
    {
      id: "test-coordinator",
      name: "Test Coordinator",
      status: "draft",
      model: "claude-3-opus",
      system_prompt: "You coordinate and orchestrate automated testing workflows...",
      version: "0.5.0",
      last_deployed: null,
    },
  ];

  function handleEditAgent() {
    setEditedManifest(JSON.stringify(agents[selectedAgent], null, 2));
    setIsEditOpen(true);
  }

  function handleSaveManifest() {
    // TODO: Call admin API to update manifest
    setIsEditOpen(false);
  }

  function handleDeploy(agentId: string) {
    // TODO: Call admin API to trigger deployment
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="lg:col-span-1">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/50">
              <h2 className="font-semibold text-sm">System Agents</h2>
            </div>
            <div className="divide-y divide-border">
              {agents.map((agent, idx) => (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(idx)}
                  className={`w-full text-left p-3 transition-colors ${
                    selectedAgent === idx
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
          </div>
        </div>

        {/* Agent Detail */}
        <div className="lg:col-span-2 space-y-4">
          {selectedAgent !== null && (
            <>
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold">{agents[selectedAgent].name}</h2>
                    <p className="text-sm text-muted-foreground font-mono mt-1">
                      {agents[selectedAgent].id}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      agents[selectedAgent].status === "active"
                        ? "bg-green-500/15 text-green-400"
                        : agents[selectedAgent].status === "staged"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-gray-500/15 text-gray-400"
                    }`}
                  >
                    {agents[selectedAgent].status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 py-4 border-t border-b border-border">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Model</p>
                    <p className="text-sm font-mono">{agents[selectedAgent].model}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Version</p>
                    <p className="text-sm font-mono">{agents[selectedAgent].version}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Last Deployed</p>
                    <p className="text-sm">
                      {agents[selectedAgent].last_deployed
                        ? new Date(agents[selectedAgent].last_deployed).toLocaleString()
                        : "Never"}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    onClick={handleEditAgent}
                    className="flex items-center gap-2 px-3 py-2 rounded text-xs bg-muted hover:bg-muted/80"
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit Manifest
                  </button>
                  {agents[selectedAgent].status !== "active" && (
                    <button
                      onClick={() => handleDeploy(agents[selectedAgent].id)}
                      className="flex items-center gap-2 px-3 py-2 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      <Play className="h-3 w-3" />
                      Deploy
                    </button>
                  )}
                </div>
              </div>

              {/* System Prompt */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="font-semibold mb-3">System Prompt</h3>
                <div className="bg-background border border-border rounded p-3 text-sm text-muted-foreground max-h-48 overflow-y-auto font-mono">
                  {agents[selectedAgent].system_prompt}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-card border border-border rounded-lg p-6">
                <h3 className="font-semibold mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs bg-muted hover:bg-muted/80">
                    <Copy className="h-3 w-3" />
                    Clone as Draft
                  </button>
                  <button className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs bg-destructive/10 text-destructive hover:bg-destructive/20">
                    Delete
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {isEditOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold">Edit Manifest</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <textarea
                value={editedManifest}
                onChange={(e) => setEditedManifest(e.target.value)}
                className="w-full h-full px-3 py-2 bg-background border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                spellCheck="false"
              />
            </div>

            <div className="p-6 border-t border-border flex gap-2">
              <button
                onClick={handleSaveManifest}
                className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90"
              >
                Save Manifest
              </button>
              <button
                onClick={() => setIsEditOpen(false)}
                className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-md text-sm font-medium hover:bg-muted/80"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
