module github.com/a1-agent-engine/mcp-registry

go 1.23

toolchain go1.26.3

require (
	github.com/a1-agent-engine/go-shared v0.0.0
	github.com/google/uuid v1.5.0
	github.com/lib/pq v1.10.9
)

replace github.com/a1-agent-engine/go-shared => ../../packages/go-shared
