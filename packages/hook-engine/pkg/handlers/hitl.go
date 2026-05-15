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
	"fmt"

	"github.com/agent-platform/hook-engine/pkg/hooks"
)

// NewHITLInterceptHandler returns a hook Handler that halts execution when the
// invoked skill is in the mutatingSkills set. Phase 3 wires the halt result to a
// Temporal workflow suspension signal.
func NewHITLInterceptHandler(mutatingSkills map[string]bool) hooks.Handler {
	return func(ctx context.Context, hctx hooks.HookContext) (hooks.HookResult, error) {
		// Check static skill map (for skills)
		if mutatingSkills[hctx.SkillName] {
			return hooks.HookResult{
				Halt:    true,
				Message: fmt.Sprintf("skill %q is mutating — HITL approval required", hctx.SkillName),
			}, nil
		}
		// Check __mutating flag in args (for direct tool invocations)
		if m, ok := hctx.Args["__mutating"].(bool); ok && m {
			return hooks.HookResult{
				Halt:    true,
				Message: fmt.Sprintf("tool %q is mutating — HITL approval required", hctx.SkillName),
			}, nil
		}
		return hooks.HookResult{}, nil
	}
}
