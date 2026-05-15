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

package handlers

import (
	"context"
	"log/slog"

	"github.com/agent-platform/hook-engine/pkg/hooks"
)

// NewAuditLogHandler returns a hook Handler that emits a structured log entry for
// every skill invocation. In Phase 4 this will be replaced with an OTel span emission.
func NewAuditLogHandler(logger *slog.Logger) hooks.Handler {
	return func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
		logger.InfoContext(ctx, "skill hook",
			"phase", string(hctx.Phase),
			"tenant_id", hctx.TenantID,
			"agent_id", hctx.AgentID,
			"skill", hctx.SkillName,
			"skill_version", hctx.SkillVersion,
			"trace_id", hctx.TraceID,
		)
		return hooks.HookResult{}, nil
	}
}
