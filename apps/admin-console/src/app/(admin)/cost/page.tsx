"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export default function CostPage() {
  const [period, setPeriod] = useState("30d");
  const [selectedTenant, setSelectedTenant] = useState("");

  const summaryCards = [
    { label: "Total Tokens", value: "1.2B", subtext: "Input + Output" },
    { label: "Estimated Cost", value: "$3,240", subtext: "30-day period" },
    { label: "Most Expensive Tenant", value: "ACME Corp", subtext: "$1,850 (57%)" },
    { label: "Top Model Used", value: "Claude 3.5 Sonnet", subtext: "680M tokens" },
  ];

  const tenantCosts = [
    {
      tenant_id: "default-tenant",
      tenant_name: "Default Tenant",
      input_tokens: 250000000,
      output_tokens: 150000000,
      cost: 1200,
      sandbox_ms: 45000,
    },
    {
      tenant_id: "acme-corp",
      tenant_name: "ACME Corp",
      input_tokens: 450000000,
      output_tokens: 300000000,
      cost: 2040,
      sandbox_ms: 78000,
    },
  ];

  const breakdown = [
    {
      tenant: "default-tenant",
      agent: "manifest-assistant",
      skill: "document-analysis",
      model: "claude-3-5-sonnet",
      tokens_in: 50000000,
      tokens_out: 30000000,
      sandbox_ms: 12000,
      cost: 240,
    },
    {
      tenant: "default-tenant",
      agent: "data-processor",
      skill: "data-extraction",
      model: "claude-3-5-sonnet",
      tokens_in: 120000000,
      tokens_out: 80000000,
      sandbox_ms: 25000,
      cost: 600,
    },
    {
      tenant: "acme-corp",
      agent: "customer-support",
      skill: "response-generation",
      model: "claude-3-opus",
      tokens_in: 200000000,
      tokens_out: 150000000,
      sandbox_ms: 35000,
      cost: 900,
    },
  ];

  function formatNumber(num: number): string {
    if (num >= 1000000000) {
      return (num / 1000000000).toFixed(2) + "B";
    }
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2) + "M";
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(2) + "K";
    }
    return num.toString();
  }

  const filteredBreakdown = selectedTenant
    ? breakdown.filter((row) => row.tenant === selectedTenant)
    : breakdown;

  const totalCost = filteredBreakdown.reduce((sum, row) => sum + row.cost, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Cost Tracking</h1>
          <p className="text-muted-foreground mt-1">
            Monitor token usage and estimated costs across tenants
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 rounded-md text-sm font-medium">
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">Period:</span>
        <div className="flex gap-2">
          {["7d", "30d", "90d"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {summaryCards.map((card, idx) => (
          <div key={idx} className="bg-card border border-border rounded-lg p-4">
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            <p className="text-2xl font-bold">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.subtext}</p>
          </div>
        ))}
      </div>

      {/* Tenant Breakdown */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">By Tenant</h2>
        <div className="space-y-3">
          {tenantCosts.map((tenant) => (
            <div key={tenant.tenant_id} className="p-4 border border-border rounded-lg">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-medium">{tenant.tenant_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{tenant.tenant_id}</p>
                </div>
                <p className="text-lg font-semibold">${tenant.cost.toLocaleString()}</p>
              </div>

              <div className="grid grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Input Tokens</p>
                  <p className="font-mono text-sm">{formatNumber(tenant.input_tokens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Output Tokens</p>
                  <p className="font-mono text-sm">{formatNumber(tenant.output_tokens)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Sandbox Time</p>
                  <p className="font-mono text-sm">{(tenant.sandbox_ms / 1000).toFixed(1)}s</p>
                </div>
                <div className="text-right">
                  <button
                    onClick={() =>
                      setSelectedTenant(
                        selectedTenant === tenant.tenant_id ? "" : tenant.tenant_id
                      )
                    }
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {selectedTenant === tenant.tenant_id ? "Hide" : "Show"} Breakdown
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">
          {selectedTenant
            ? `Breakdown for ${tenantCosts.find((t) => t.tenant_id === selectedTenant)?.tenant_name}`
            : "Detailed Breakdown"}
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border">
              <tr>
                <th className="text-left py-2 px-4">Tenant</th>
                <th className="text-left py-2 px-4">Agent</th>
                <th className="text-left py-2 px-4">Skill</th>
                <th className="text-left py-2 px-4">Model</th>
                <th className="text-right py-2 px-4">Tokens In</th>
                <th className="text-right py-2 px-4">Tokens Out</th>
                <th className="text-right py-2 px-4">Sandbox ms</th>
                <th className="text-right py-2 px-4">Cost</th>
              </tr>
            </thead>
            <tbody>
              {filteredBreakdown.map((row, idx) => (
                <tr key={idx} className="border-b border-border hover:bg-muted/30">
                  <td className="py-2 px-4 font-mono text-xs">{row.tenant}</td>
                  <td className="py-2 px-4 text-sm">{row.agent}</td>
                  <td className="py-2 px-4 text-sm">{row.skill}</td>
                  <td className="py-2 px-4 text-sm">{row.model}</td>
                  <td className="py-2 px-4 text-right font-mono text-xs">
                    {formatNumber(row.tokens_in)}
                  </td>
                  <td className="py-2 px-4 text-right font-mono text-xs">
                    {formatNumber(row.tokens_out)}
                  </td>
                  <td className="py-2 px-4 text-right">{row.sandbox_ms}</td>
                  <td className="py-2 px-4 text-right font-semibold">${row.cost}</td>
                </tr>
              ))}
              {filteredBreakdown.length > 0 && (
                <tr className="border-t-2 border-border font-semibold">
                  <td colSpan={7} className="py-2 px-4 text-right">
                    Total:
                  </td>
                  <td className="py-2 px-4 text-right">${totalCost}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {filteredBreakdown.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No cost data available for selected filters
          </div>
        )}
      </div>
    </div>
  );
}
