#!/bin/bash

# Enhanced deployment script for Google Cloud Run
# Usage: ./scripts/deploy.sh [environment] [options]

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-production}"
REGION="${REGION:-asia-northeast3}"
SERVICE_NAME="mobile-voice-ordering"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Please install it first."
        exit 1
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install it first."
        exit 1
    fi
    
    # Check if project ID is set
    if [ -z "$GOOGLE_CLOUD_PROJECT_ID" ]; then
        GOOGLE_CLOUD_PROJECT_ID=$(gcloud config get-value project)
        if [ -z "$GOOGLE_CLOUD_PROJECT_ID" ]; then
            log_error "GOOGLE_CLOUD_PROJECT_ID is not set and no default project found."
            exit 1
        fi
    fi
    
    log_success "Prerequisites check passed"
}

# Validate environment variables
validate_environment() {
    log_info "Validating environment configuration..."
    
    local required_secrets=(
        "supabase-url"
        "supabase-anon-key" 
        "supabase-service-role-key"
        "gemini-api-key"
        "nextauth-secret"
    )
    
    for secret in "${required_secrets[@]}"; do
        if ! gcloud secrets describe "$secret" --project="$GOOGLE_CLOUD_PROJECT_ID" &> /dev/null; then
            log_warning "Secret '$secret' not found. Please create it before deployment."
        fi
    done
    
    log_success "Environment validation completed"
}

# Build and push Docker image
build_and_push() {
    log_info "Building and pushing Docker image..."
    
    local image_tag="gcr.io/$GOOGLE_CLOUD_PROJECT_ID/$SERVICE_NAME:$(git rev-parse --short HEAD 2>/dev/null || echo 'latest')"
    local latest_tag="gcr.io/$GOOGLE_CLOUD_PROJECT_ID/$SERVICE_NAME:latest"
    
    # Build image
    docker build \
        --target runner \
        --cache-from "$latest_tag" \
        -t "$image_tag" \
        -t "$latest_tag" \
        "$PROJECT_ROOT"
    
    # Push images
    docker push "$image_tag"
    docker push "$latest_tag"
    
    echo "$image_tag" > /tmp/image_tag
    log_success "Image built and pushed: $image_tag"
}

# Deploy to Cloud Run
deploy_to_cloud_run() {
    log_info "Deploying to Cloud Run..."
    
    local image_tag=$(cat /tmp/image_tag)
    
    # Deploy with comprehensive configuration
    gcloud run deploy "$SERVICE_NAME" \
        --image "$image_tag" \
        --region "$REGION" \
        --platform managed \
        --allow-unauthenticated \
        --memory 2Gi \
        --cpu 2 \
        --concurrency 80 \
        --min-instances 0 \
        --max-instances 10 \
        --timeout 300 \
        --port 8080 \
        --set-env-vars "NODE_ENV=production,PORT=8080,HOSTNAME=0.0.0.0,GOOGLE_CLOUD_PROJECT_ID=$GOOGLE_CLOUD_PROJECT_ID" \
        --service-account "mobile-voice-ordering@$GOOGLE_CLOUD_PROJECT_ID.iam.gserviceaccount.com" \
        --labels "app=mobile-voice-ordering,environment=$ENVIRONMENT" \
        --execution-environment gen2 \
        --cpu-boost \
        --project "$GOOGLE_CLOUD_PROJECT_ID"
    
    log_success "Deployment to Cloud Run completed"
}

# Get service URL
get_service_url() {
    local service_url=$(gcloud run services describe "$SERVICE_NAME" \
        --region "$REGION" \
        --project "$GOOGLE_CLOUD_PROJECT_ID" \
        --format "value(status.url)")
    
    log_success "Service URL: $service_url"
    echo "$service_url" > /tmp/service_url
}

# Health check
health_check() {
    log_info "Performing health check..."
    
    local service_url=$(cat /tmp/service_url)
    local health_url="$service_url/api/health"
    
    # Wait for service to be ready
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$health_url" > /dev/null; then
            log_success "Health check passed"
            return 0
        fi
        
        log_info "Health check attempt $attempt/$max_attempts failed, retrying in 10 seconds..."
        sleep 10
        ((attempt++))
    done
    
    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Cleanup
cleanup() {
    rm -f /tmp/image_tag /tmp/service_url
}

# Main deployment function
main() {
    log_info "Starting deployment of Mobile Voice Ordering System"
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Project: $GOOGLE_CLOUD_PROJECT_ID"
    
    trap cleanup EXIT
    
    check_prerequisites
    validate_environment
    build_and_push
    deploy_to_cloud_run
    get_service_url
    health_check
    
    log_success "🚀 Deployment completed successfully!"
    log_info "Service is available at: $(cat /tmp/service_url)"
}

# Show usage
show_usage() {
    echo "Usage: $0 [environment] [options]"
    echo ""
    echo "Arguments:"
    echo "  environment    Deployment environment (default: production)"
    echo ""
    echo "Environment Variables:"
    echo "  GOOGLE_CLOUD_PROJECT_ID    Google Cloud project ID"
    echo "  REGION                     Deployment region (default: asia-northeast3)"
    echo ""
    echo "Examples:"
    echo "  $0                         # Deploy to production"
    echo "  $0 staging                 # Deploy to staging"
    echo "  REGION=us-central1 $0      # Deploy to different region"
}

# Handle command line arguments
case "${1:-}" in
    -h|--help)
        show_usage
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac