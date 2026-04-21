package models

// TriggerRequest represents the external request to trigger an agent.
type TriggerRequest struct {
	EventSource string         `json:"event_source"`
	Payload     map[string]any `json:"payload"`
}

// TriggerResponse is the response sent back to the external client.
type TriggerResponse struct {
	WorkflowID string `json:"workflow_id"`
	RunID      string `json:"run_id"`
	Status     string `json:"status"`
}

// StartSessionRequest represents the internal request to the Workflow Initiator.
type StartSessionRequest struct {
	AgentID   string            `json:"agent_id"`
	SessionID string            `json:"session_id"`
	Context   map[string]string `json:"context"`
	Manifest  *AgentManifest    `json:"manifest,omitempty"`
}

// SessionStatus represents the current status of an agent session.
type SessionStatus struct {
	WorkflowID string `json:"workflow_id"`
	RunID      string `json:"run_id"`
	Status     string `json:"status"`
	Result     string `json:"result,omitempty"`
}

// AgentManifest defines the configuration and capabilities of an agent.
type AgentManifest struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	SystemPrompt string            `json:"system_prompt"`
	Skills       []SkillDefinition `json:"skills"`
	Model        string            `json:"model"`
}

// SkillDefinition defines a tool or capability an agent can use.
type SkillDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

// --- LLM Gateway Models ---

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// LLMRequest represents a request to the LLM Gateway.
type LLMRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream,omitempty"`
}

// LLMResponse represents a response from the LLM Gateway.
type LLMResponse struct {
	ID      string `json:"id"`
	Content string `json:"content"`
	Model   string `json:"model"`
}
