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

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { setRuntimeTenant, getRuntimeTenant, adminApi, Tenant } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const STORAGE_KEY = "agent-studio-tenant-id";

interface TenantCtx {
  tenantId: string;
  setTenantId: (id: string) => void;
  availableTenants: Tenant[];
  isLoading: boolean;
}

const TenantContext = createContext<TenantCtx | null>(null);

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [tenantId, _setTenantId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) ?? getRuntimeTenant();
    }
    return getRuntimeTenant();
  });
  const [availableTenants, setAvailableTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Sync initial tenant into api module on mount; setTenantId handles updates
  useEffect(() => {
    setRuntimeTenant(tenantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch tenant list from Admin API
  useEffect(() => {
    adminApi
      .listTenants()
      .then((data) =>
        setAvailableTenants(data.tenants.filter((t) => t.status === "active"))
      )
      .catch(() =>
        setAvailableTenants([
          { tenant_id: tenantId, display_name: tenantId, status: "active" },
        ])
      )
      .finally(() => setIsLoading(false));
  }, [tenantId]);

  const setTenantId = useCallback(
    (id: string) => {
      _setTenantId(id);
      setRuntimeTenant(id);
      localStorage.setItem(STORAGE_KEY, id);
      queryClient.invalidateQueries();
    },
    [queryClient]
  );

  return (
    <TenantContext.Provider
      value={{ tenantId, setTenantId, availableTenants, isLoading }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenant must be used within TenantProvider");
  return ctx;
}
