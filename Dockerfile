# Use official Node.js runtime as base image
FROM node:18-alpine as base

# Set working directory in container
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Production build
FROM base as production
# Install only production dependencies
RUN npm ci --only=production

# Development build  
FROM base as development
# Install all dependencies including dev dependencies
RUN npm ci

# Final stage - use production as default
FROM production as final

# Copy application code
COPY . .

# Create forms directory if it doesn't exist
RUN mkdir -p forms

# Create directory for SQLite databases with proper permissions
RUN mkdir -p data && chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose the application port
EXPOSE 3000

# Health check to ensure container is running properly
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000', (res) => { \
    console.log('Health check:', res.statusCode); \
    process.exit(res.statusCode === 200 ? 0 : 1); \
  }).on('error', () => process.exit(1))"

# Start the application
CMD ["npm", "start"] 