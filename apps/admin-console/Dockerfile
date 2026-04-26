# Builder stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files from monorepo root
COPY package.json package-lock.json ./

# Copy app
COPY apps/admin-console ./apps/admin-console

# Install dependencies
RUN npm ci

# Build app
WORKDIR /app/apps/admin-console
RUN npm run build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/apps/admin-console/package.json ./
COPY --from=builder /app/apps/admin-console/.next ./.next
COPY --from=builder /app/apps/admin-console/public ./public
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001

CMD ["npm", "start"]
