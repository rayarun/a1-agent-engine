package hooks

import (
	"context"
	"fmt"
	"sort"
	"sync"
)

// Engine registers and executes pre/post skill hooks in priority order.
type Engine struct {
	mu    sync.RWMutex
	hooks []HookRegistration
}

// New returns an empty Engine.
func New() *Engine {
	return &Engine{}
}

// Register adds a hook. Hooks are sorted by Priority ascending after each registration.
// Thread-safe.
func (e *Engine) Register(reg HookRegistration) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.hooks = append(e.hooks, reg)
	sort.SliceStable(e.hooks, func(i, j int) bool {
		return e.hooks[i].Priority < e.hooks[j].Priority
	})
}

// Fire executes all hooks whose SkillName and Phase match hctx, in priority order.
//
// Halt semantics: if a handler returns HookResult{Halt: true}, Fire stops executing
// remaining hooks and returns immediately with that result.
//
// Error semantics: if a handler returns an error, Fire logs the error (via the returned
// error accumulator), continues executing remaining hooks, and returns the first error
// encountered after all hooks have run. This ensures non-critical hooks (e.g. audit log
// backend unavailable) do not prevent other hooks from executing.
func (e *Engine) Fire(ctx context.Context, hctx HookContext) (HookResult, error) {
	e.mu.RLock()
	matching := make([]HookRegistration, 0, len(e.hooks))
	for _, reg := range e.hooks {
		if reg.Phase == hctx.Phase && e.matchesSkill(reg, hctx.SkillName) {
			matching = append(matching, reg)
		}
	}
	e.mu.RUnlock()

	var firstErr error
	for _, reg := range matching {
		result, err := reg.Handler(ctx, hctx)
		if err != nil && firstErr == nil {
			firstErr = fmt.Errorf("hook %s/%s: %w", reg.Phase, reg.Type, err)
		}
		if result.Halt {
			return result, firstErr
		}
	}

	return HookResult{}, firstErr
}

func (e *Engine) matchesSkill(reg HookRegistration, skillName string) bool {
	return reg.SkillName == "*" || reg.SkillName == skillName
}
