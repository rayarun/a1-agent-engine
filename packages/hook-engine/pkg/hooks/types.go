package hooks

import (
	"context"
	"time"
)

// Phase indicates when a hook executes relative to skill dispatch.
type Phase string

const (
	PhasePre  Phase = "pre"
	PhasePost Phase = "post"
)

// HookType categorises the cross-cutting concern a hook implements.
type HookType string

const (
	HookTypeAuditLog      HookType = "audit_log"
	HookTypeCostMeter     HookType = "cost_meter"
	HookTypeHITLIntercept HookType = "hitl_intercept"
	HookTypeRateLimit     HookType = "rate_limit"
)

// HookContext carries execution metadata passed to every hook handler.
type HookContext struct {
	Phase        Phase
	TenantID     string
	AgentID      string
	SkillName    string
	SkillVersion string
	Args         map[string]any // skill invocation arguments
	Result       map[string]any // populated during post-phase
	TraceID      string
	Timestamp    time.Time
}

// HookResult is returned by a single handler invocation.
type HookResult struct {
	Halt    bool   // if true, abort skill execution immediately
	Message string // human-readable reason (used on Halt)
}

// Handler is a function that executes a hook.
type Handler func(ctx context.Context, hctx HookContext) (HookResult, error)

// HookRegistration describes a hook to be registered with the Engine.
type HookRegistration struct {
	SkillName string   // exact skill name, or "*" for all skills
	Phase     Phase    // pre or post
	Type      HookType // cross-cutting concern category
	Priority  int      // lower value executes first
	Handler   Handler
}
