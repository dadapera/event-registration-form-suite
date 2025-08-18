# Base Dockerfile for Event Form Services
FROM node:18-alpine

# Install dependencies for health checks and fonts
RUN apk add --no-cache \
    curl \
    freetype \
    freetype-dev \
    ca-certificates \
    ttf-freefont

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy shared utilities
COPY utils/ ./utils/

# Copy service-specific files (will be overridden in specific service builds)
COPY services/INSTANCE_NAME/ ./

# Create data directory for SQLite databases
RUN mkdir -p /app/data

# Expose port (will be set by environment variable)
EXPOSE ${SERVICE_PORT:-3000}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${SERVICE_PORT:-3000}/health || exit 1

# Start the service
CMD ["node", "service.js"] 