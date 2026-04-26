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
COPY services/admin-api ./services/admin-api

WORKDIR /app/services/admin-api
RUN GOPROXY=direct go mod download
RUN go build -o /admin-api main.go

# --- Final Stage ---
FROM alpine:latest

WORKDIR /
COPY --from=builder /admin-api /admin-api

EXPOSE 8089

ENTRYPOINT ["/admin-api"]
