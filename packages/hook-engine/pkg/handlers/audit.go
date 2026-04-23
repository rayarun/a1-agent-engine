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
