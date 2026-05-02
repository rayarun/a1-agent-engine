'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface MCPToken {
  id: string;
  description: string;
  tenant_id: string;
  created_at: string;
  expires_at: string | null;
}

export default function MCPServersPage() {
  const queryClient = useQueryClient();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [showNewToken, setShowNewToken] = useState(false);

  // Fetch tokens
  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ['mcp-tokens'],
    queryFn: async () => {
      const response = await fetch('/api/v1/admin/mcp/tokens', {
        headers: {
          'Authorization': `Bearer ${typeof window !== 'undefined' ? sessionStorage.getItem('adminKey') : ''}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch tokens');
      const data = await response.json();
      return data.tokens || [];
    },
  });

  // Issue new token mutation
  const issueTokenMutation = useMutation({
    mutationFn: async (description: string) => {
      const response = await fetch('/api/v1/admin/mcp/tokens', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${typeof window !== 'undefined' ? sessionStorage.getItem('adminKey') : ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ description }),
      });
      if (!response.ok) throw new Error('Failed to issue token');
      return response.json();
    },
    onSuccess: (data) => {
      setNewToken(data.token);
      setShowNewToken(true);
      queryClient.invalidateQueries({ queryKey: ['mcp-tokens'] });
    },
  });

  // Revoke token mutation
  const revokeTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/v1/admin/mcp/tokens/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${typeof window !== 'undefined' ? sessionStorage.getItem('adminKey') : ''}`,
        },
      });
      if (!response.ok) throw new Error('Failed to revoke token');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-tokens'] });
    },
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleDateString();
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">MCP Server Integration</h1>
        <p className="text-gray-500 mt-2">Manage external MCP client access to platform skills</p>
      </div>

      {/* MCP Server Endpoint Info */}
      <Card>
        <CardHeader>
          <CardTitle>MCP Server Endpoint</CardTitle>
          <CardDescription>Configure external MCP clients (e.g., Claude Desktop) with this URL</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Endpoint URL</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value="http://localhost:8091/mcp"
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText('http://localhost:8091/mcp');
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Transport: HTTP POST JSON-RPC 2.0 + SSE for notifications</p>
            </div>

            <div>
              <label className="text-sm font-medium">SSE Stream URL</label>
              <div className="mt-1 flex gap-2">
                <input
                  type="text"
                  value="http://localhost:8091/mcp/sse"
                  readOnly
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText('http://localhost:8091/mcp/sse');
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* New Token Section */}
      <Card>
        <CardHeader>
          <CardTitle>Issue New Token</CardTitle>
          <CardDescription>Generate a bearer token for external MCP clients</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Token description (e.g., 'Claude Desktop - John')"
              id="tokenDesc"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
            <Button
              onClick={() => {
                const desc = (document.getElementById('tokenDesc') as HTMLInputElement).value;
                if (desc.trim()) {
                  issueTokenMutation.mutate(desc);
                  (document.getElementById('tokenDesc') as HTMLInputElement).value = '';
                }
              }}
              disabled={issueTokenMutation.isPending}
            >
              {issueTokenMutation.isPending ? 'Issuing...' : 'Issue Token'}
            </Button>

            {/* Show new token once */}
            {showNewToken && newToken && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm font-medium text-green-900 mb-2">✓ Token issued (shown once)</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newToken}
                    readOnly
                    className="flex-1 px-3 py-2 border border-green-300 rounded-md bg-white text-sm font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(newToken);
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-green-700 mt-2">
                  Use this token in your MCP client config: Authorization: Bearer {'{token}'}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowNewToken(false)}
                  className="mt-2"
                >
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tokens Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Tokens</CardTitle>
          <CardDescription>Manage issued MCP bearer tokens</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading tokens...</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-gray-500">No tokens issued yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token: MCPToken) => (
                  <TableRow key={token.id} className={isExpired(token.expires_at) ? 'opacity-50' : ''}>
                    <TableCell className="text-sm">{token.description}</TableCell>
                    <TableCell className="text-sm">{token.tenant_id}</TableCell>
                    <TableCell className="text-sm">{formatDate(token.created_at)}</TableCell>
                    <TableCell className="text-sm">{formatDate(token.expires_at)}</TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        isExpired(token.expires_at)
                          ? 'bg-red-100 text-red-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {isExpired(token.expires_at) ? 'Expired' : 'Active'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Are you sure? This will immediately revoke the token.')) {
                            revokeTokenMutation.mutate(token.id);
                          }
                        }}
                        disabled={revokeTokenMutation.isPending}
                        className="text-red-600 hover:text-red-700"
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Configuration Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Claude Desktop Configuration</CardTitle>
          <CardDescription>Add this MCP server to Claude Desktop</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 p-4 rounded-md overflow-auto">
            <pre className="text-xs text-gray-700 font-mono">
{`{
  "mcpServers": {
    "a1-agent-engine": {
      "url": "http://localhost:8091/mcp",
      "env": {
        "AUTHORIZATION": "Bearer <YOUR_TOKEN_HERE>"
      }
    }
  }
}`}
            </pre>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Save this to ~/.config/Claude/claude_desktop_config.json (or equivalent for your OS).
            Replace &lt;YOUR_TOKEN_HERE&gt; with a token issued above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
