# --- Build Stage ---
FROM golang:alpine AS builder

WORKDIR /app

# Copy shared packages
COPY packages/go-shared ./packages/go-shared

# Copy service code
COPY services/sandbox-manager ./services/sandbox-manager

WORKDIR /app/services/sandbox-manager
RUN go mod download
RUN go build -o /sandbox-manager main.go

# --- Final Stage ---
FROM alpine:latest

# We don't need docker installed here if we only use the SDK via socket,
# but having the CLI can be helpful for debugging.
RUN apk add --no-cache docker-cli

WORKDIR /
COPY --from=builder /sandbox-manager /sandbox-manager

EXPOSE 8082

ENTRYPOINT ["/sandbox-manager"]
