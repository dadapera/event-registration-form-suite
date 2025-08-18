# Dockerfile for Crociera Fiordi Service
FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy shared utilities
COPY utils/ ./utils/

# Copy service-specific files
COPY forms/crociera-fiordi/ ./
COPY services/base/service.js ./

# Create data directory for SQLite databases
RUN mkdir -p /app/data

# Expose service port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start the service
CMD ["node", "service.js"] 