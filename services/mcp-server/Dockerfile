FROM golang:1.21-alpine AS builder

WORKDIR /app

# Copy go.mod and go.sum (if exists)
COPY services/mcp-server/go.mod .
COPY services/mcp-server/go.sum . 2>/dev/null || true

# Copy go-shared dependency
COPY packages/go-shared ../go-shared

# Download dependencies
RUN go mod download

# Copy source
COPY services/mcp-server .

# Build
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o mcp-server .

# Final stage
FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/mcp-server .

EXPOSE 8091

CMD ["./mcp-server"]
