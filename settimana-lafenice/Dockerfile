# Dockerfile for Settimana La Fenice Standalone Service
FROM node:18-alpine

# Install curl for health checks, fonts for PDF generation, and PostgreSQL client
RUN apk add --no-cache \
    curl \
    freetype \
    freetype-dev \
    ca-certificates \
    ttf-freefont \
    postgresql-client

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev && npm cache clean --force

# Copy application files
COPY . .

# Expose the port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the service
CMD ["node", "server.js"]
