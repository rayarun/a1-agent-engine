# --- Build Stage ---
FROM golang:alpine AS builder

WORKDIR /app

# Copy shared packages
COPY packages/go-shared ./packages/go-shared

# Copy service code
COPY services/llm-gateway ./services/llm-gateway

WORKDIR /app/services/llm-gateway
RUN go mod download
RUN go mod tidy
RUN go build -o /llm-gateway main.go

# --- Final Stage ---
FROM alpine:latest

WORKDIR /
COPY --from=builder /llm-gateway /llm-gateway

EXPOSE 8083

ENTRYPOINT ["/llm-gateway"]
