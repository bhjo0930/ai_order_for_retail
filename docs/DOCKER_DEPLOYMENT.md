# Docker Deployment Guide

This guide covers containerization and deployment of the Mobile Voice Ordering System for Google Cloud Run.

## Docker Configuration

### Multi-Stage Build

The Dockerfile uses a multi-stage build process optimized for production:

1. **Base Stage**: Sets up Node.js 20 LTS with security updates
2. **Dependencies Stage**: Installs production dependencies
3. **Builder Stage**: Builds the Next.js application
4. **Runner Stage**: Creates the final production image

### Key Features

- **Security**: Non-root user, minimal attack surface
- **Performance**: Optimized layer caching, minimal image size
- **Reliability**: Health checks, graceful shutdown handling
- **Observability**: Structured logging, proper signal handling

## Local Development

### Build and Run Locally

```bash
# Build the production image
npm run docker:build:production

# Run locally (mimics Cloud Run environment)
npm run docker:run:production

# Test health check
npm run docker:test
```

### Using Docker Compose

```bash
# Start with Cloud Run-like configuration
docker-compose -f docker-compose.cloudrun.yml up

# View logs
docker-compose -f docker-compose.cloudrun.yml logs -f

# Stop services
docker-compose -f docker-compose.cloudrun.yml down
```

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `8080` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | `eyJ...` |
| `GOOGLE_CLOUD_PROJECT_ID` | Google Cloud project ID | `my-project-123` |
| `GEMINI_API_KEY` | Gemini API key | `AIza...` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MOCK_PAYMENT_SUCCESS_RATE` | Payment success rate | `0.9` |
| `MOCK_PAYMENT_DELAY_MS` | Payment delay | `2000` |
| `LOG_LEVEL` | Logging level | `info` |
| `NEXTAUTH_SECRET` | NextAuth secret | Generated |

## Health Checks

The container includes comprehensive health checks:

- **Endpoint**: `/api/health`
- **Interval**: 30 seconds
- **Timeout**: 10 seconds
- **Retries**: 3

### Health Check Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.45,
  "environment": "production",
  "version": "1.0.0"
}
```

## Graceful Shutdown

The container handles shutdown signals properly:

1. **SIGTERM/SIGINT**: Initiates graceful shutdown
2. **30-second timeout**: Forces shutdown if graceful fails
3. **Connection draining**: Allows existing requests to complete
4. **Resource cleanup**: Closes database connections, etc.

## Security Features

### Container Security

- **Non-root user**: Runs as `nextjs` user (UID 1001)
- **Read-only filesystem**: Prevents runtime modifications
- **Minimal privileges**: Drops unnecessary capabilities
- **Security headers**: Implements security best practices

### Network Security

- **HTTPS only**: Enforces secure connections
- **CORS configuration**: Restricts cross-origin requests
- **Rate limiting**: Prevents abuse
- **Input validation**: Sanitizes all inputs

## Performance Optimization

### Build Optimization

- **Layer caching**: Optimized for Docker layer reuse
- **Dependency separation**: Dependencies cached separately
- **Multi-stage builds**: Minimal final image size
- **Build context**: Optimized `.dockerignore`

### Runtime Optimization

- **Next.js standalone**: Minimal runtime dependencies
- **Static asset optimization**: Efficient asset serving
- **Memory management**: Proper garbage collection
- **Connection pooling**: Efficient database connections

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Check build context size
   docker build --no-cache -t test .
   
   # Verify dependencies
   docker run --rm -it node:20-alpine npm ci
   ```

2. **Runtime Errors**
   ```bash
   # Check environment variables
   docker run --rm mobile-voice-ordering node -e "console.log(process.env)"
   
   # Test health check
   docker run --rm mobile-voice-ordering node /app/health-check.js
   ```

3. **Performance Issues**
   ```bash
   # Monitor resource usage
   docker stats
   
   # Check logs
   docker logs -f container_name
   ```

### Debug Mode

```bash
# Run with debug output
docker run -e DEBUG=* mobile-voice-ordering

# Interactive shell
docker run -it --entrypoint /bin/sh mobile-voice-ordering
```

## Best Practices

### Development

1. **Use multi-stage builds** for optimal image size
2. **Implement health checks** for reliability
3. **Handle signals properly** for graceful shutdown
4. **Validate environment** before starting
5. **Use non-root users** for security

### Production

1. **Set resource limits** appropriate for workload
2. **Configure monitoring** and alerting
3. **Implement log aggregation** for observability
4. **Use secrets management** for sensitive data
5. **Regular security updates** for base images

### Monitoring

1. **Health check endpoints** for load balancers
2. **Structured logging** for analysis
3. **Metrics collection** for performance
4. **Error tracking** for reliability
5. **Distributed tracing** for debugging