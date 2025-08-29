# Mobile Voice Ordering System - Deployment Guide

This document provides comprehensive instructions for deploying the Mobile Voice Ordering System to Google Cloud Run.

## Quick Start

### 1. Prerequisites
- Google Cloud account with billing enabled
- Google Cloud CLI installed and authenticated
- Docker installed
- Node.js 20+ installed

### 2. Initial Setup
```bash
# Clone the repository
git clone <repository-url>
cd mobile-voice-ordering

# Set your Google Cloud project ID
export GOOGLE_CLOUD_PROJECT_ID="your-project-id"

# Run the setup script
./scripts/setup-gcp-resources.sh
```

### 3. Deploy
```bash
# Deploy to production
./scripts/deploy.sh

# Or deploy to staging
./scripts/deploy.sh staging
```

## Detailed Documentation

### Docker Configuration
- **File**: `Dockerfile`
- **Features**: Multi-stage build, health checks, graceful shutdown
- **Documentation**: [Docker Deployment Guide](docs/DOCKER_DEPLOYMENT.md)

### Cloud Run Configuration
- **Files**: `cloudbuild.yaml`, `cloud-run-service.yaml`
- **Features**: Auto-scaling, monitoring, security
- **Documentation**: [Cloud Run Deployment Guide](docs/CLOUD_RUN_DEPLOYMENT.md)

### CI/CD Pipeline
- **File**: `.github/workflows/deploy.yml`
- **Features**: Automated testing, staging/production deployment
- **Triggers**: Push to main (production), push to develop (staging)

## Environment Configuration

### Required Secrets (Google Secret Manager)
- `supabase-url`: Your Supabase project URL
- `supabase-anon-key`: Supabase anonymous key
- `supabase-service-role-key`: Supabase service role key
- `gemini-api-key`: Google Gemini API key
- `nextauth-secret`: NextAuth.js secret

### Environment Variables
- `NODE_ENV`: Set to "production"
- `PORT`: Set to 8080 for Cloud Run
- `GOOGLE_CLOUD_PROJECT_ID`: Your GCP project ID

## Monitoring and Alerting

### Setup Monitoring
```bash
./scripts/setup-monitoring.sh
```

### Available Metrics
- Request count and response times
- Error rates and success rates
- Memory and CPU utilization
- Voice recognition accuracy
- Order completion rates

### Health Checks
- **Endpoint**: `/api/health`
- **Response**: JSON with service status
- **Monitoring**: Automatic Cloud Run health checks

## Security

### Service Account
- Dedicated service account with minimal permissions
- Access to required Google Cloud services only
- Secrets managed through Secret Manager

### Network Security
- HTTPS only
- CORS configured
- Security headers implemented
- Input validation and sanitization

## Scaling and Performance

### Auto-scaling Configuration
- **Min instances**: 0 (cost optimization)
- **Max instances**: 10 (production), 5 (staging)
- **Concurrency**: 80 requests per instance
- **CPU**: 2 vCPU with boost enabled
- **Memory**: 2 GiB

### Performance Optimizations
- Multi-stage Docker build
- Optimized Next.js configuration
- Efficient dependency management
- Connection pooling and caching

## Cost Management

### Cost Optimization Features
- Minimum instances set to 0
- Efficient resource allocation
- Optimized container startup time
- Request-based pricing model

### Monitoring Costs
- Use Google Cloud Billing alerts
- Monitor resource utilization
- Review scaling metrics regularly

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Check build logs
   gcloud builds log BUILD_ID
   
   # Test local build
   docker build -t test .
   ```

2. **Deployment Issues**
   ```bash
   # Check service status
   gcloud run services describe mobile-voice-ordering --region=asia-northeast3
   
   # View logs
   gcloud logs tail --project=$GOOGLE_CLOUD_PROJECT_ID
   ```

3. **Health Check Failures**
   ```bash
   # Test health endpoint
   curl https://your-service-url/api/health
   ```

### Support Resources
- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Next.js Deployment](https://nextjs.org/docs/deployment)

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Testing Deployment
```bash
# Build and test Docker image locally
npm run docker:build:production
npm run docker:run:production

# Test health check
curl http://localhost:8080/api/health
```

### Staging Deployment
- Push to `develop` branch
- Automatic deployment via GitHub Actions
- Service available at staging URL

### Production Deployment
- Push to `main` branch
- Automatic deployment via GitHub Actions
- Blue-green deployment with traffic migration

## Maintenance

### Regular Tasks
1. Monitor service health and performance
2. Review and update dependencies
3. Check security vulnerabilities
4. Optimize resource allocation based on usage

### Updates and Rollbacks
```bash
# Deploy new version
./scripts/deploy.sh

# Rollback if needed
gcloud run services update-traffic mobile-voice-ordering \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=asia-northeast3
```

### Backup and Recovery
- Database backups handled by Supabase
- Container images stored in Google Container Registry
- Configuration stored in version control

## Additional Resources

- [Architecture Documentation](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Security Guidelines](docs/SECURITY.md)
- [Performance Tuning](docs/PERFORMANCE.md)

## Support

For deployment issues or questions:
1. Check this documentation
2. Review Cloud Run logs
3. Consult Google Cloud documentation
4. Contact the development team