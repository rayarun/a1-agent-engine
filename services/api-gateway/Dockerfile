# --- Build Stage ---
FROM golang:alpine AS builder

WORKDIR /app

# Copy shared packages
COPY packages/go-shared ./packages/go-shared

# Copy service code
COPY services/api-gateway ./services/api-gateway

WORKDIR /app/services/api-gateway
RUN go mod download
RUN go build -o /api-gateway main.go

# --- Final Stage ---
FROM alpine:latest

WORKDIR /
COPY --from=builder /api-gateway /api-gateway

EXPOSE 8080

ENTRYPOINT ["/api-gateway"]
