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

import { useSearchParams } from "next/navigation";
import { ApprovalsPanel } from "@/components/approvals-panel";

export default function ApprovalsPage() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get("tenant") || "default-tenant";

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tool Approvals</h1>
          <p className="text-muted-foreground mt-2">
            Review and approve or deny pending tool execution requests that require human verification.
          </p>
        </div>

        <ApprovalsPanel tenantId={tenantId} />
      </div>
    </div>
  );
}
