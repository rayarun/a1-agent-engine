module github.com/agent-platform/api-gateway

go 1.23

require (
	github.com/agent-platform/go-shared v0.0.0-00010101000000-000000000000
	github.com/stretchr/testify v1.11.1
)

require (
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/agent-platform/go-shared => ../../packages/go-shared
