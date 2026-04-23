# ---- deps stage ----
FROM node:22-alpine AS deps

RUN sed -i "s/https/http/g" /etc/apk/repositories
COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN apk add --no-cache ca-certificates && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt

WORKDIR /workspace

COPY package.json package-lock.json ./
COPY apps/agent-studio/package.json ./apps/agent-studio/
RUN npm ci --ignore-scripts --strict-ssl=false

# ---- builder stage ----
FROM node:22-alpine AS builder

RUN sed -i "s/https/http/g" /etc/apk/repositories
COPY zscaler.pem /usr/local/share/ca-certificates/zscaler.crt
RUN apk add --no-cache ca-certificates && update-ca-certificates
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/zscaler.crt

WORKDIR /workspace

COPY --from=deps /workspace/node_modules ./node_modules
COPY apps/agent-studio ./apps/agent-studio
COPY package.json ./

# NEXT_PUBLIC_* vars must be set at build time to be embedded in the JS bundle.
# Pass them via --build-arg if the services are not on localhost.
ARG NEXT_PUBLIC_API_GATEWAY_URL=http://localhost:8080
ARG NEXT_PUBLIC_TOOL_REGISTRY_URL=http://localhost:8086
ARG NEXT_PUBLIC_SKILL_CATALOG_URL=http://localhost:8087
ARG NEXT_PUBLIC_AGENT_REGISTRY_URL=http://localhost:8088
ARG NEXT_PUBLIC_TENANT_ID=default-tenant

ENV NEXT_PUBLIC_API_GATEWAY_URL=$NEXT_PUBLIC_API_GATEWAY_URL
ENV NEXT_PUBLIC_TOOL_REGISTRY_URL=$NEXT_PUBLIC_TOOL_REGISTRY_URL
ENV NEXT_PUBLIC_SKILL_CATALOG_URL=$NEXT_PUBLIC_SKILL_CATALOG_URL
ENV NEXT_PUBLIC_AGENT_REGISTRY_URL=$NEXT_PUBLIC_AGENT_REGISTRY_URL
ENV NEXT_PUBLIC_TENANT_ID=$NEXT_PUBLIC_TENANT_ID
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /workspace/apps/agent-studio
RUN npx next build

# ---- runner stage ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone output mirrors the monorepo layout:
#   /app/apps/agent-studio/server.js   <- entry point
#   /app/node_modules/                 <- minimal runtime deps
COPY --from=builder /workspace/apps/agent-studio/.next/standalone ./
# static assets and public dir must be adjacent to the app directory
COPY --from=builder /workspace/apps/agent-studio/.next/static ./apps/agent-studio/.next/static
COPY --from=builder /workspace/apps/agent-studio/public ./apps/agent-studio/public

EXPOSE 3000

WORKDIR /app/apps/agent-studio
CMD ["node", "server.js"]
