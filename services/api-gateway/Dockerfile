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
COPY services/api-gateway ./services/api-gateway

WORKDIR /app/services/api-gateway
RUN GOPROXY=direct go mod download
RUN go build -o /api-gateway main.go

# --- Final Stage ---
FROM alpine:latest

WORKDIR /
COPY --from=builder /api-gateway /api-gateway

EXPOSE 8080

ENTRYPOINT ["/api-gateway"]
