module github.com/agent-platform/bash-executor

go 1.23

toolchain go1.26.3

require github.com/agent-platform/webhook-security v0.0.0-00010101000000-000000000000

replace github.com/agent-platform/go-shared => ../../packages/go-shared

replace github.com/agent-platform/webhook-security => ../../packages/webhook-security
