module github.com/agent-platform/llm-gateway

go 1.23.0

replace github.com/agent-platform/go-shared => ../../packages/go-shared

require github.com/sashabaranov/go-openai v1.27.1

require (
	github.com/davecgh/go-spew v1.1.2-0.20180830191138-d8f796af33cc // indirect
	github.com/liushuangls/go-anthropic/v2 v2.18.0
	github.com/pmezard/go-difflib v1.0.1-0.20181226105442-5d4384ee4fb2 // indirect
)
