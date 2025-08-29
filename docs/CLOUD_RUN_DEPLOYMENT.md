# Google Cloud Run Deployment Guide

This guide covers the complete deployment process for the Mobile Voice Ordering System on Google Cloud Run.

## Prerequisites

### Required Tools
- Google Cloud CLI (`gcloud`)
- Docker
- Git
- Node.js 20+

### Google Cloud Setup
1. Create or select a Google Cloud project
2. Enable billing for the project
3. Install and authenticate gcloud CLI

## Initial Setup

### 1. Run Setup Script
```bash
# Set your project ID
export GOOGLE_CLOUD_PROJECT_ID="your-project-id"

# Run the setup script
./scripts/setup-gcp-resources.sh
```

This script will:
- Enable required Google Cloud APIs
- Create service account with necessary permissions
- Create secrets in Secret Manager
- Configure Cloud Build
- Create initial Cloud Run service
- Setup monitoring and logging

### 2. Configure Secrets
Update the secrets created in Secret Manager with actual values:

```bash
# Supabase configuration
echo -n "your-supabase-url" | gcloud secrets versions add supabase-url --data-file=-
echo -n "your-supabase-anon-key" | gcloud secrets versions add supabase-anon-key --data-file=-
echo -n "your-service-role-key" | gcloud secrets versions add supabase-service-role-key --data-file=-

# Gemini API key
echo -n "your-gemini-api-key" | gcloud secrets versions add gemini-api-key --data-file=-

# NextAuth secret (generate with: openssl rand -base64 32)
echo -n "your-nextauth-secret" | gcloud secrets versions add nextauth-secret --data-file=-
```

## Deployment Methods

### Method 1: Manual Deployment
```bash
# Deploy using the deployment script
./scripts/deploy.sh

# Or deploy to specific environment
./scripts/deploy.sh staging
```

### Method 2: Cloud Build
```bash
# Submit build to Cloud Build
gcloud builds submit --config cloudbuild.yaml
```

### Method 3: GitHub Actions (CI/CD)
1. Add secrets to GitHub repository:
   - `GOOGLE_CLOUD_PROJECT_ID`
   - `GCP_SA_KEY` (service account key JSON)

2. Push to main branch for production deployment
3. Push to develop branch for staging deployment

## Configuration

### Environment Variables
The following environment variables are configured automatically:

| Variable | Description | Source |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | Set by deployment |
| `PORT` | Server port | Set to 8080 |
| `GOOGLE_CLOUD_PROJECT_ID` | GCP project ID | Set by deployment |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Secret Manager |
| `GEMINI_API_KEY` | Gemini API key | Secret Manager |

### Resource Allocation
- **Memory**: 2 GiB
- **CPU**: 2 vCPU
- **Concurrency**: 80 requests per instance
- **Scaling**: 0-10 instances
- **Timeout**: 300 seconds

## Monitoring and Logging

### Cloud Logging
View logs in Google Cloud Console:
```bash
gcloud logs read --project=$GOOGLE_CLOUD_PROJECT_ID \
  --filter='resource.type=cloud_run_revision AND resource.labels.service_name=mobile-voice-ordering'
```

### Health Checks
The service includes comprehensive health checks:
- **Endpoint**: `/api/health`
- **Liveness**: Every 30 seconds
- **Readiness**: Every 10 seconds
- **Startup**: Every 10 seconds (max 5 minutes)

### Metrics
Custom metrics are created for:
- Error count
- Request count
- Response times
- Resource utilization

## Security

### Service Account
The service runs with a dedicated service account with minimal permissions:
- Cloud Run invoker
- Secret Manager accessor
- Speech API client
- AI Platform user
- Logging and monitoring

### Network Security
- HTTPS only
- CORS configured
- Security headers implemented
- Input validation

### Secrets Management
All sensitive data is stored in Google Secret Manager:
- Automatic rotation support
- Access logging
- IAM-based access control

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Check build logs
   gcloud builds log BUILD_ID
   
   # Test local build
   docker build -t test .
   ```

2. **Deployment Failures**
   ```bash
   # Check service status
   gcloud run services describe mobile-voice-ordering --region=asia-northeast3
   
   # View recent logs
   gcloud logs tail --project=$GOOGLE_CLOUD_PROJECT_ID
   ```

3. **Health Check Failures**
   ```bash
   # Test health endpoint
   curl https://your-service-url/api/health
   
   # Check container logs
   gcloud logs read --filter='resource.labels.service_name=mobile-voice-ordering'
   ```

### Performance Optimization

1. **Cold Start Reduction**
   - Minimum instances set to 0 for cost optimization
   - CPU boost enabled for faster startup
   - Optimized Docker image with multi-stage build

2. **Memory Management**
   - 2 GiB memory allocation
   - Efficient garbage collection
   - Connection pooling

3. **Scaling Configuration**
   - 80 concurrent requests per instance
   - Maximum 10 instances
   - Automatic scaling based on demand

## Cost Optimization

### Pricing Factors
- CPU and memory allocation
- Request count
- Execution time
- Network egress

### Cost Reduction Tips
1. Use minimum instances = 0
2. Optimize container startup time
3. Implement efficient caching
4. Monitor and adjust resource allocation

## Maintenance

### Updates
```bash
# Deploy new version
./scripts/deploy.sh

# Rollback if needed
gcloud run services update-traffic mobile-voice-ordering \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=asia-northeast3
```

### Scaling
```bash
# Update scaling configuration
gcloud run services update mobile-voice-ordering \
  --max-instances=20 \
  --region=asia-northeast3
```

### Resource Updates
```bash
# Update memory allocation
gcloud run services update mobile-voice-ordering \
  --memory=4Gi \
  --region=asia-northeast3
```

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Cloud Run logs
3. Consult Google Cloud documentation
4. Contact the development team