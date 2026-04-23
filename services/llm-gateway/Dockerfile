# --- Build Stage ---
FROM golang:alpine AS builder

# Bypass TLS for apk then install certs
RUN sed -i "s/https/http/g" /etc/apk/repositories
COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN apk add --no-cache ca-certificates git && update-ca-certificates

WORKDIR /app

# Copy shared packages
COPY packages ./packages

# Copy service code
COPY services/llm-gateway ./services/llm-gateway

WORKDIR /app/services/llm-gateway
RUN GOPROXY=direct go mod download
RUN go mod tidy
RUN go build -o /llm-gateway main.go

# --- Final Stage ---
FROM alpine:latest

WORKDIR /
COPY --from=builder /llm-gateway /llm-gateway

EXPOSE 8083

ENTRYPOINT ["/llm-gateway"]
