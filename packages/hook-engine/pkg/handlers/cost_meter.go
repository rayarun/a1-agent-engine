package handlers

import (
	"context"
	"log/slog"

	"github.com/agent-platform/hook-engine/pkg/hooks"
)

// NewCostMeterHandler returns a stub cost metering handler.
// Phase 4 replaces this with a real OTel span emission to the Cost Attribution Service.
func NewCostMeterHandler() hooks.Handler {
	return func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
		slog.InfoContext(ctx, "cost meter hook (stub)",
			"phase", string(hctx.Phase),
			"tenant_id", hctx.TenantID,
			"skill", hctx.SkillName,
		)
		return hooks.HookResult{}, nil
	}
}
