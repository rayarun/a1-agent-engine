package hooks_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/agent-platform/hook-engine/pkg/hooks"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func baseContext() hooks.HookContext {
	return hooks.HookContext{
		Phase:        hooks.PhasePre,
		TenantID:     "tenant-abc",
		AgentID:      "agent-1",
		SkillName:    "db-triage",
		SkillVersion: "1.0.0",
		TraceID:      "trace-xyz",
		Timestamp:    time.Now(),
	}
}

func TestEngine_SingleHookFires(t *testing.T) {
	engine := hooks.New()
	fired := false

	engine.Register(hooks.HookRegistration{
		SkillName: "db-triage",
		Phase:     hooks.PhasePre,
		Type:      hooks.HookTypeAuditLog,
		Priority:  0,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			fired = true
			return hooks.HookResult{}, nil
		},
	})

	result, err := engine.Fire(context.Background(), baseContext())
	require.NoError(t, err)
	assert.True(t, fired)
	assert.False(t, result.Halt)
}

func TestEngine_GlobalWildcard(t *testing.T) {
	engine := hooks.New()
	callCount := 0

	engine.Register(hooks.HookRegistration{
		SkillName: "*",
		Phase:     hooks.PhasePre,
		Type:      hooks.HookTypeAuditLog,
		Priority:  0,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			callCount++
			return hooks.HookResult{}, nil
		},
	})

	hctx1 := baseContext()
	hctx1.SkillName = "db-triage"
	engine.Fire(context.Background(), hctx1)

	hctx2 := baseContext()
	hctx2.SkillName = "k8s-remediation"
	engine.Fire(context.Background(), hctx2)

	assert.Equal(t, 2, callCount)
}

func TestEngine_PhaseFiltering(t *testing.T) {
	engine := hooks.New()
	preFired := false
	postFired := false

	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePre, Type: hooks.HookTypeAuditLog, Priority: 0,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			preFired = true
			return hooks.HookResult{}, nil
		},
	})
	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePost, Type: hooks.HookTypeCostMeter, Priority: 0,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			postFired = true
			return hooks.HookResult{}, nil
		},
	})

	preCtx := baseContext()
	preCtx.Phase = hooks.PhasePre
	engine.Fire(context.Background(), preCtx)

	assert.True(t, preFired)
	assert.False(t, postFired)

	postCtx := baseContext()
	postCtx.Phase = hooks.PhasePost
	preFired = false
	engine.Fire(context.Background(), postCtx)

	assert.False(t, preFired)
	assert.True(t, postFired)
}

func TestEngine_PriorityOrder(t *testing.T) {
	engine := hooks.New()
	order := []int{}

	// Register in reverse order to ensure sorting works.
	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePre, Type: hooks.HookTypeAuditLog, Priority: 10,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			order = append(order, 10)
			return hooks.HookResult{}, nil
		},
	})
	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePre, Type: hooks.HookTypeCostMeter, Priority: 1,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			order = append(order, 1)
			return hooks.HookResult{}, nil
		},
	})
	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePre, Type: hooks.HookTypeHITLIntercept, Priority: 5,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			order = append(order, 5)
			return hooks.HookResult{}, nil
		},
	})

	engine.Fire(context.Background(), baseContext())
	assert.Equal(t, []int{1, 5, 10}, order)
}

func TestEngine_HaltPropagation(t *testing.T) {
	engine := hooks.New()
	secondFired := false

	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePre, Type: hooks.HookTypeHITLIntercept, Priority: 0,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			return hooks.HookResult{Halt: true, Message: "mutating tool requires approval"}, nil
		},
	})
	// Second hook — should NOT fire if first halts.
	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePre, Type: hooks.HookTypeAuditLog, Priority: 1,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			secondFired = true
			return hooks.HookResult{}, nil
		},
	})

	result, err := engine.Fire(context.Background(), baseContext())
	require.NoError(t, err)
	assert.True(t, result.Halt)
	assert.Equal(t, "mutating tool requires approval", result.Message)
	// Halt short-circuits: second hook must not run.
	assert.False(t, secondFired)
}

func TestEngine_ErrorContinuesExecution(t *testing.T) {
	engine := hooks.New()
	secondFired := false

	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePre, Type: hooks.HookTypeAuditLog, Priority: 0,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			return hooks.HookResult{}, errors.New("audit log backend unavailable")
		},
	})
	engine.Register(hooks.HookRegistration{
		SkillName: "*", Phase: hooks.PhasePre, Type: hooks.HookTypeCostMeter, Priority: 1,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			secondFired = true
			return hooks.HookResult{}, nil
		},
	})

	result, err := engine.Fire(context.Background(), baseContext())
	// Fire should return the first error but still run all hooks.
	assert.Error(t, err)
	assert.True(t, secondFired)
	assert.False(t, result.Halt)
}

func TestEngine_NoMatchingHooks(t *testing.T) {
	engine := hooks.New()

	// Register a hook for a different skill.
	engine.Register(hooks.HookRegistration{
		SkillName: "k8s-remediation", Phase: hooks.PhasePre, Type: hooks.HookTypeAuditLog, Priority: 0,
		Handler: func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
			return hooks.HookResult{Halt: true}, nil
		},
	})

	result, err := engine.Fire(context.Background(), baseContext()) // SkillName="db-triage"
	require.NoError(t, err)
	assert.False(t, result.Halt) // no matching hook, no halt
}
