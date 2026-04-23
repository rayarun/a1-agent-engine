# --- Build Stage ---
FROM golang:alpine AS builder

# Bypass TLS for apk then install certs
RUN sed -i "s/https/http/g" /etc/apk/repositories
COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN apk add --no-cache ca-certificates git && update-ca-certificates

# Trust Zscaler Cert
COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN apk add --no-cache ca-certificates git && update-ca-certificates

COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN apk add --no-cache ca-certificates git && update-ca-certificates

RUN sed -i "s/https/http/g" /etc/apk/repositories

RUN apk add --no-cache --allow-untrusted ca-certificates git

WORKDIR /app

COPY packages ./packages
COPY services/agent-registry ./services/agent-registry

WORKDIR /app/services/agent-registry
RUN GOPROXY=direct go mod download
RUN go build -o /agent-registry main.go

# --- Final Stage ---
FROM alpine:latest

WORKDIR /
COPY --from=builder /agent-registry /agent-registry

EXPOSE 8088

ENTRYPOINT ["/agent-registry"]
