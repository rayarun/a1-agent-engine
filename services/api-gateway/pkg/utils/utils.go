package utils

import "fmt"

// FormatAgentID prefixes a raw ID with 'agent_'.
func FormatAgentID(id string) string {
	return fmt.Sprintf("agent_%s", id)
}
