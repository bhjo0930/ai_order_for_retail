# Stage 1: Build the application
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production image
FROM node:20-slim AS runner
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production

# Copy built application from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json


# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
