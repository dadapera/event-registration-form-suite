# Docker Deployment Guide

This guide covers how to deploy the Event Form Suite using Docker.

## Quick Start

1. **Build and run with Docker Compose (Recommended)**:
   ```bash
   docker-compose up -d
   ```

2. **Or build and run manually**:
   ```bash
   # Build the image
   docker build -t event-form-suite .
   
   # Run the container
   docker run -d \
     --name event-form-suite \
     -p 3000:3000 \
     -v $(pwd)/forms:/app/forms \
     -v $(pwd)/data:/app/data \
     event-form-suite
   ```

3. **Access the application**:
   - Main application: http://localhost:3000
   - Admin dashboard: http://localhost:3000/admin

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and customize as needed:

```bash
cp .env.example .env
```

Key environment variables:
- `PORT`: Application port (default: 3000)
- `NODE_ENV`: Environment mode (production/development)
- `SMTP_*`: Email configuration for notifications
- `ADMIN_PASSWORD`: Admin dashboard password

### Volume Mounts

The container uses several volume mounts for data persistence:

- `./forms:/app/forms` - Form instances and SQLite databases
- `./data:/app/data` - Additional application data
- `./public/assets:/app/public/assets` - Static assets (optional)

## Production Deployment

### 1. With Reverse Proxy

For production, uncomment the nginx service in `docker-compose.yml`:

```yaml
# Uncomment nginx service for production
nginx:
  image: nginx:alpine
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx.conf:/etc/nginx/nginx.conf:ro
    - ./ssl:/etc/ssl:ro
```

### 2. Security Considerations

- Change default admin password
- Use environment variables for sensitive data
- Set up SSL/TLS certificates
- Configure firewall rules
- Regular database backups

### 3. Backup Strategy

```bash
# Backup all form databases
docker exec event-form-suite tar -czf - /app/forms | cat > backup-$(date +%Y%m%d).tar.gz

# Restore from backup
cat backup-20240101.tar.gz | docker exec -i event-form-suite tar -xzf - -C /
```

## Development

### Development with Docker

```bash
# Use development override
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Debugging

```bash
# View logs
docker-compose logs -f event-form-suite

# Access container shell
docker exec -it event-form-suite sh

# Check health status
docker-compose ps
```

## Scaling

### Multiple Instances

For load balancing, run multiple instances:

```yaml
version: '3.8'
services:
  event-form-suite:
    scale: 3
    # ... rest of configuration
  
  nginx:
    # Configure load balancing in nginx.conf
```

### Database Considerations

- SQLite is file-based and suitable for single-instance deployments
- For multi-instance scaling, consider migrating to PostgreSQL or MySQL
- Shared volume access requires careful consideration with SQLite

## Monitoring

### Health Checks

The container includes built-in health checks:

```bash
# Check health status
docker inspect --format='{{.State.Health.Status}}' event-form-suite
```

### Resource Monitoring

```bash
# Monitor resource usage
docker stats event-form-suite
```

## Troubleshooting

### Common Issues

1. **Permission Errors**:
   ```bash
   # Fix volume permissions
   sudo chown -R 1000:1000 ./forms ./data
   ```

2. **Port Already in Use**:
   ```bash
   # Check what's using port 3000
   netstat -tulpn | grep :3000
   
   # Use different port
   PORT=3001 docker-compose up
   ```

3. **Database Connection Issues**:
   ```bash
   # Check SQLite file permissions
   docker exec event-form-suite ls -la /app/forms/*/database.sqlite
   ```

### Container Logs

```bash
# View all logs
docker-compose logs

# Follow logs in real-time
docker-compose logs -f event-form-suite

# View specific timeframe
docker-compose logs --since="1h" event-form-suite
```

## Updates

### Updating the Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database Migrations

When updating, ensure database schema compatibility:

```bash
# Backup before updating
docker exec event-form-suite tar -czf - /app/forms > pre-update-backup.tar.gz

# Check logs for migration messages
docker-compose logs event-form-suite | grep -i migration
``` 