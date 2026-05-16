module github.com/agent-platform/workflow-service

go 1.24.0

require (
	github.com/agent-platform/go-shared v0.0.0-00010101000000-000000000000
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.5.0
	github.com/lib/pq v1.10.9
	go.temporal.io/sdk v1.42.0
)

replace github.com/agent-platform/go-shared => ../../packages/go-shared
