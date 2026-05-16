FROM golang:1.24-alpine AS builder

# Use http:// for apk to bypass Zscaler TLS interception
RUN sed -i 's/https/http/g' /etc/apk/repositories && \
    apk update && apk add --no-cache ca-certificates git

# Copy and install Zscaler cert if available
COPY infra/certs/zscaler-root-ca.pem /usr/local/share/ca-certificates/zscaler.crt
RUN update-ca-certificates 2>/dev/null || true

ENV GOPROXY=direct GOSUMDB=off

WORKDIR /app

# Copy go-shared to where the replace directive expects it
COPY packages/go-shared /app/packages/go-shared
COPY services/workflow-service /app/workflow-service

WORKDIR /app/workflow-service

# Fix go.mod replace path for Docker context
RUN sed -i 's|=> ../../packages/go-shared|=> ../packages/go-shared|' go.mod

# Run go mod download first to fetch dependencies
RUN go mod download

# Tidy go.sum
RUN go mod tidy

# Build with direct module mode (no proxy)
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o workflow-service .

# Final stage - use distroless for smaller image and no package install issues
FROM gcr.io/distroless/base-debian12

WORKDIR /root/

COPY --from=builder /app/workflow-service .

EXPOSE 8094

CMD ["./workflow-service"]
