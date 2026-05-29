FROM golang:alpine AS builder

# Use http:// for apk to bypass Zscaler TLS interception, then install certs
RUN sed -i 's/https/http/g' /etc/apk/repositories && \
    apk update && apk add --no-cache ca-certificates git
COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN update-ca-certificates

WORKDIR /app

# Copy shared packages (bash-executor depends on webhook-security via replace)
COPY packages ./packages

# Copy service code
COPY services/bash-executor ./services/bash-executor

WORKDIR /app/services/bash-executor
RUN GOPROXY=https://proxy.golang.org,direct go mod download
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /bash-executor main.go

FROM debian:bookworm-slim

COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN apt-get update && apt-get install -y --no-install-recommends bash ca-certificates && update-ca-certificates && rm -rf /var/lib/apt/lists/*
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt

COPY --from=builder /bash-executor /bash-executor

EXPOSE 8092

CMD ["/bash-executor"]
