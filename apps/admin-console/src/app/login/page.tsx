"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const key = sessionStorage.getItem("admin_api_key");
    if (key) {
      router.push("/dashboard");
    }
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await adminApi.verifyAuth(apiKey);
      if (result.valid) {
        sessionStorage.setItem("admin_api_key", apiKey);
        router.push("/dashboard");
      } else {
        setError("Invalid API key");
      }
    } catch (err) {
      setError("Failed to verify API key. Is the admin API running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Admin Console</h1>
          <p className="text-muted-foreground">
            A1 Agent Engine Platform Administration
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="space-y-4 bg-card border border-border rounded-lg p-6"
        >
          <div>
            <label className="block text-sm font-medium mb-2">
              Admin API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your admin API key"
              className="w-full px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={loading}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading || !apiKey}
            className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="text-xs text-muted-foreground text-center mt-4">
          Default key for local development: <code>dev-admin-key</code>
        </p>
      </div>
    </div>
  );
}
