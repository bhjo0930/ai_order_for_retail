#!/bin/bash

# Setup Google Cloud Platform resources for Mobile Voice Ordering System
# This script creates all necessary GCP resources for deployment

set -e

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT_ID}"
REGION="${REGION:-asia-northeast3}"
SERVICE_NAME="mobile-voice-ordering"
SERVICE_ACCOUNT_NAME="mobile-voice-ordering"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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
    
    if [ -z "$PROJECT_ID" ]; then
        PROJECT_ID=$(gcloud config get-value project)
        if [ -z "$PROJECT_ID" ]; then
            log_error "GOOGLE_CLOUD_PROJECT_ID is not set and no default project found."
            exit 1
        fi
    fi
    
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
    log_info "Project ID: $PROJECT_ID"
    log_info "Region: $REGION"
}

# Enable required APIs
enable_apis() {
    log_info "Enabling required Google Cloud APIs..."
    
    local apis=(
        "run.googleapis.com"
        "cloudbuild.googleapis.com"
        "containerregistry.googleapis.com"
        "secretmanager.googleapis.com"
        "speech.googleapis.com"
        "aiplatform.googleapis.com"
        "logging.googleapis.com"
        "monitoring.googleapis.com"
        "cloudtrace.googleapis.com"
        "cloudprofiler.googleapis.com"
    )
    
    for api in "${apis[@]}"; do
        log_info "Enabling $api..."
        gcloud services enable "$api" --project="$PROJECT_ID"
    done
    
    log_success "All required APIs enabled"
}

# Create service account
create_service_account() {
    log_info "Creating service account..."
    
    # Create service account if it doesn't exist
    if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" --project="$PROJECT_ID" &> /dev/null; then
        gcloud iam service-accounts create "$SERVICE_ACCOUNT_NAME" \
            --display-name="Mobile Voice Ordering Service Account" \
            --description="Service account for Mobile Voice Ordering System" \
            --project="$PROJECT_ID"
        
        log_success "Service account created"
    else
        log_info "Service account already exists"
    fi
    
    # Grant necessary roles
    local roles=(
        "roles/run.invoker"
        "roles/secretmanager.secretAccessor"
        "roles/speech.client"
        "roles/aiplatform.user"
        "roles/logging.logWriter"
        "roles/monitoring.metricWriter"
        "roles/cloudtrace.agent"
        "roles/cloudprofiler.agent"
    )
    
    for role in "${roles[@]}"; do
        log_info "Granting role $role..."
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
            --role="$role" \
            --quiet
    done
    
    log_success "Service account configured with necessary roles"
}

# Create secrets in Secret Manager
create_secrets() {
    log_info "Creating secrets in Secret Manager..."
    
    local secrets=(
        "supabase-url:Enter your Supabase project URL"
        "supabase-anon-key:Enter your Supabase anonymous key"
        "supabase-service-role-key:Enter your Supabase service role key"
        "gemini-api-key:Enter your Gemini API key"
        "nextauth-secret:Enter your NextAuth secret (generate with: openssl rand -base64 32)"
    )
    
    for secret_info in "${secrets[@]}"; do
        local secret_name="${secret_info%%:*}"
        local secret_description="${secret_info#*:}"
        
        if ! gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &> /dev/null; then
            log_info "Creating secret: $secret_name"
            echo "Please provide the value for $secret_name"
            echo "Description: $secret_description"
            read -s -p "Value: " secret_value
            echo
            
            if [ -n "$secret_value" ]; then
                echo -n "$secret_value" | gcloud secrets create "$secret_name" \
                    --data-file=- \
                    --project="$PROJECT_ID"
                log_success "Secret $secret_name created"
            else
                log_warning "Skipping empty secret: $secret_name"
            fi
        else
            log_info "Secret $secret_name already exists"
        fi
    done
    
    # Grant service account access to secrets
    local secrets_list=(
        "supabase-url"
        "supabase-anon-key"
        "supabase-service-role-key"
        "gemini-api-key"
        "nextauth-secret"
    )
    
    for secret_name in "${secrets_list[@]}"; do
        if gcloud secrets describe "$secret_name" --project="$PROJECT_ID" &> /dev/null; then
            gcloud secrets add-iam-policy-binding "$secret_name" \
                --member="serviceAccount:$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
                --role="roles/secretmanager.secretAccessor" \
                --project="$PROJECT_ID" \
                --quiet
        fi
    done
    
    log_success "Secrets configuration completed"
}

# Configure Cloud Build
configure_cloud_build() {
    log_info "Configuring Cloud Build..."
    
    # Grant Cloud Build service account necessary permissions
    local cloud_build_sa=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")@cloudbuild.gserviceaccount.com
    
    local roles=(
        "roles/run.admin"
        "roles/iam.serviceAccountUser"
        "roles/secretmanager.secretAccessor"
    )
    
    for role in "${roles[@]}"; do
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$cloud_build_sa" \
            --role="$role" \
            --quiet
    done
    
    log_success "Cloud Build configured"
}

# Create Cloud Run service (initial deployment)
create_cloud_run_service() {
    log_info "Creating initial Cloud Run service..."
    
    # Check if service already exists
    if gcloud run services describe "$SERVICE_NAME" --region="$REGION" --project="$PROJECT_ID" &> /dev/null; then
        log_info "Cloud Run service already exists"
        return 0
    fi
    
    # Create a minimal service that will be updated by the deployment
    gcloud run deploy "$SERVICE_NAME" \
        --image="gcr.io/cloudrun/hello" \
        --region="$REGION" \
        --platform="managed" \
        --allow-unauthenticated \
        --memory="512Mi" \
        --cpu="1" \
        --max-instances="1" \
        --service-account="$SERVICE_ACCOUNT_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
        --labels="app=mobile-voice-ordering,environment=setup" \
        --project="$PROJECT_ID"
    
    log_success "Initial Cloud Run service created"
}

# Setup monitoring and logging
setup_monitoring() {
    log_info "Setting up monitoring and logging..."
    
    # Create log-based metrics
    gcloud logging metrics create "voice_ordering_errors" \
        --description="Count of errors in voice ordering system" \
        --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="mobile-voice-ordering" AND severity>=ERROR' \
        --project="$PROJECT_ID" \
        --quiet || log_info "Metric already exists"
    
    gcloud logging metrics create "voice_ordering_requests" \
        --description="Count of requests to voice ordering system" \
        --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="mobile-voice-ordering" AND httpRequest.requestMethod!=""' \
        --project="$PROJECT_ID" \
        --quiet || log_info "Metric already exists"
    
    log_success "Monitoring and logging configured"
}

# Create VPC connector (optional, for private networking)
create_vpc_connector() {
    log_info "Creating VPC connector (optional)..."
    
    # This is optional and can be skipped if not needed
    if ! gcloud compute networks vpc-access connectors describe "default-connector" --region="$REGION" --project="$PROJECT_ID" &> /dev/null; then
        log_info "VPC connector not found, skipping creation (optional)"
        log_info "To create VPC connector manually, run:"
        log_info "gcloud compute networks vpc-access connectors create default-connector --region=$REGION --subnet=default --subnet-project=$PROJECT_ID"
    else
        log_info "VPC connector already exists"
    fi
}

# Main setup function
main() {
    log_info "Starting Google Cloud Platform setup for Mobile Voice Ordering System"
    
    check_prerequisites
    enable_apis
    create_service_account
    create_secrets
    configure_cloud_build
    create_cloud_run_service
    setup_monitoring
    create_vpc_connector
    
    log_success "🎉 GCP setup completed successfully!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Update secrets with actual values if you skipped any"
    log_info "2. Run deployment: ./scripts/deploy.sh"
    log_info "3. Configure your domain and SSL certificate if needed"
    log_info ""
    log_info "Useful commands:"
    log_info "- View service: gcloud run services describe $SERVICE_NAME --region=$REGION"
    log_info "- View logs: gcloud logs read --project=$PROJECT_ID --filter='resource.type=cloud_run_revision'"
    log_info "- Update secrets: gcloud secrets versions add SECRET_NAME --data-file=-"
}

# Show usage
show_usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Environment Variables:"
    echo "  GOOGLE_CLOUD_PROJECT_ID    Google Cloud project ID (required)"
    echo "  REGION                     Deployment region (default: asia-northeast3)"
    echo ""
    echo "This script will:"
    echo "  1. Enable required Google Cloud APIs"
    echo "  2. Create service account with necessary permissions"
    echo "  3. Create secrets in Secret Manager"
    echo "  4. Configure Cloud Build"
    echo "  5. Create initial Cloud Run service"
    echo "  6. Setup monitoring and logging"
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