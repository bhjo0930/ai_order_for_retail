# Multi-stage Dockerfile optimized for Google Cloud Run
# Use Node.js 20 LTS for better performance and security
FROM node:20-alpine AS base

# Install system dependencies and security updates
RUN apk add --no-cache \
    libc6-compat \
    dumb-init \
    && apk upgrade --no-cache

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Stage 1: Install dependencies
FROM base AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install all dependencies (including devDependencies for build)
RUN npm ci --frozen-lockfile && \
    npm cache clean --force

# Stage 2: Build application
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application (skip linting for production build)
RUN npm run build:production

# Stage 3: Production runtime
FROM base AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Set Cloud Run specific environment variables
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

# Copy built application from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy health check and startup scripts
COPY --from=builder --chown=nextjs:nodejs /app/scripts/health-check.js /app/health-check.js
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start.js /app/start.js

# Switch to non-root user
USER nextjs

# Expose the port that Cloud Run expects
EXPOSE 8080

# Add health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node /app/health-check.js

# Use dumb-init to handle signals properly and start with graceful shutdown wrapper
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "/app/start.js"]