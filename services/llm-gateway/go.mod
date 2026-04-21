module github.com/agent-platform/llm-gateway

go 1.23

replace github.com/agent-platform/go-shared => ../../packages/go-shared

require (
	github.com/agent-platform/go-shared v0.0.0-00010101000000-000000000000
	github.com/sashabaranov/go-openai v1.27.1
)
