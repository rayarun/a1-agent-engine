# --- Build Stage ---
FROM golang:alpine AS builder

WORKDIR /app

# Copy shared packages
COPY packages/go-shared ./packages/go-shared

# Copy service code
COPY services/workflow-initiator ./services/workflow-initiator

WORKDIR /app/services/workflow-initiator
RUN go mod download
RUN go build -o /workflow-initiator main.go

# --- Final Stage ---
FROM alpine:latest

WORKDIR /
COPY --from=builder /workflow-initiator /workflow-initiator

EXPOSE 8081

ENTRYPOINT ["/workflow-initiator"]
