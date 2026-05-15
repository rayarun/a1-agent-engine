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

import { useTenant } from "@/contexts/tenant-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";

export function TenantSelector() {
  const { tenantId, setTenantId, availableTenants, isLoading } = useTenant();

  if (isLoading) return null;

  if (availableTenants.length <= 1) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" />
        <span>{tenantId}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
      <Select value={tenantId} onValueChange={setTenantId}>
        <SelectTrigger className="h-7 w-[160px] text-xs border-none shadow-none focus:ring-0 bg-transparent">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {availableTenants.map((t) => (
            <SelectItem
              key={t.tenant_id}
              value={t.tenant_id}
              className="text-xs"
            >
              {t.display_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
