#!/bin/bash

# Setup monitoring and alerting for Mobile Voice Ordering System

set -e

PROJECT_ID="${GOOGLE_CLOUD_PROJECT_ID}"
SERVICE_NAME="mobile-voice-ordering"
REGION="${REGION:-asia-northeast3}"

# Colors
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
            log_error "GOOGLE_CLOUD_PROJECT_ID is not set"
            exit 1
        fi
    fi
    
    log_success "Project ID: $PROJECT_ID"
}

# Create notification channels
create_notification_channels() {
    log_info "Creating notification channels..."
    
    # Email notification channel
    read -p "Enter email address for alerts: " email_address
    if [ -n "$email_address" ]; then
        gcloud alpha monitoring channels create \
            --display-name="Mobile Voice Ordering Alerts" \
            --type=email \
            --channel-labels=email_address="$email_address" \
            --project="$PROJECT_ID" || log_warning "Email channel may already exist"
    fi
    
    # Slack notification channel (optional)
    read -p "Enter Slack webhook URL (optional): " slack_webhook
    if [ -n "$slack_webhook" ]; then
        gcloud alpha monitoring channels create \
            --display-name="Mobile Voice Ordering Slack" \
            --type=slack \
            --channel-labels=url="$slack_webhook" \
            --project="$PROJECT_ID" || log_warning "Slack channel may already exist"
    fi
    
    log_success "Notification channels created"
}

# Create custom metrics
create_custom_metrics() {
    log_info "Creating custom metrics..."
    
    # Voice recognition accuracy metric
    gcloud logging metrics create voice_recognition_accuracy \
        --description="Voice recognition accuracy rate" \
        --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="mobile-voice-ordering" AND jsonPayload.event="voice_recognition_complete"' \
        --value-extractor='EXTRACT(jsonPayload.accuracy)' \
        --project="$PROJECT_ID" || log_info "Metric may already exist"
    
    # Order completion rate
    gcloud logging metrics create order_completion_rate \
        --description="Order completion success rate" \
        --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="mobile-voice-ordering" AND jsonPayload.event="order_completed"' \
        --project="$PROJECT_ID" || log_info "Metric may already exist"
    
    # Payment processing time
    gcloud logging metrics create payment_processing_time \
        --description="Payment processing duration" \
        --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="mobile-voice-ordering" AND jsonPayload.event="payment_processed"' \
        --value-extractor='EXTRACT(jsonPayload.duration_ms)' \
        --project="$PROJECT_ID" || log_info "Metric may already exist"
    
    log_success "Custom metrics created"
}

# Create dashboards
create_dashboards() {
    log_info "Creating monitoring dashboards..."
    
    # Create dashboard JSON
    cat > /tmp/dashboard.json << EOF
{
  "displayName": "Mobile Voice Ordering System",
  "mosaicLayout": {
    "tiles": [
      {
        "width": 6,
        "height": 4,
        "widget": {
          "title": "Request Count",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mobile-voice-ordering\" AND metric.type=\"run.googleapis.com/request_count\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "crossSeriesReducer": "REDUCE_SUM"
                    }
                  }
                }
              }
            ],
            "timeshiftDuration": "0s",
            "yAxis": {
              "label": "Requests/sec",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "width": 6,
        "height": 4,
        "xPos": 6,
        "widget": {
          "title": "Response Time (95th percentile)",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mobile-voice-ordering\" AND metric.type=\"run.googleapis.com/request_latencies\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_DELTA",
                      "crossSeriesReducer": "REDUCE_PERCENTILE_95"
                    }
                  }
                }
              }
            ],
            "timeshiftDuration": "0s",
            "yAxis": {
              "label": "Latency (ms)",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "width": 6,
        "height": 4,
        "yPos": 4,
        "widget": {
          "title": "Error Rate",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mobile-voice-ordering\" AND metric.type=\"logging.googleapis.com/user/voice_ordering_errors\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_RATE",
                      "crossSeriesReducer": "REDUCE_SUM"
                    }
                  }
                }
              }
            ],
            "timeshiftDuration": "0s",
            "yAxis": {
              "label": "Errors/sec",
              "scale": "LINEAR"
            }
          }
        }
      },
      {
        "width": 6,
        "height": 4,
        "xPos": 6,
        "yPos": 4,
        "widget": {
          "title": "Memory Usage",
          "xyChart": {
            "dataSets": [
              {
                "timeSeriesQuery": {
                  "timeSeriesFilter": {
                    "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"mobile-voice-ordering\" AND metric.type=\"run.googleapis.com/container/memory/utilizations\"",
                    "aggregation": {
                      "alignmentPeriod": "60s",
                      "perSeriesAligner": "ALIGN_MEAN",
                      "crossSeriesReducer": "REDUCE_MEAN"
                    }
                  }
                }
              }
            ],
            "timeshiftDuration": "0s",
            "yAxis": {
              "label": "Memory %",
              "scale": "LINEAR"
            }
          }
        }
      }
    ]
  }
}
EOF
    
    # Create dashboard
    gcloud monitoring dashboards create --config-from-file=/tmp/dashboard.json --project="$PROJECT_ID"
    
    rm /tmp/dashboard.json
    log_success "Dashboard created"
}

# Create uptime checks
create_uptime_checks() {
    log_info "Creating uptime checks..."
    
    # Get service URL
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --format="value(status.url)" 2>/dev/null || echo "")
    
    if [ -n "$SERVICE_URL" ]; then
        # Extract hostname from URL
        HOSTNAME=$(echo "$SERVICE_URL" | sed 's|https://||' | sed 's|/.*||')
        
        gcloud monitoring uptime create \
            --display-name="Mobile Voice Ordering Health Check" \
            --http-check-path="/api/health" \
            --hostname="$HOSTNAME" \
            --port=443 \
            --use-ssl \
            --project="$PROJECT_ID" || log_warning "Uptime check may already exist"
        
        log_success "Uptime check created for $SERVICE_URL"
    else
        log_warning "Service not found, skipping uptime check creation"
    fi
}

# Main function
main() {
    log_info "Setting up monitoring for Mobile Voice Ordering System"
    
    check_prerequisites
    create_notification_channels
    create_custom_metrics
    create_dashboards
    create_uptime_checks
    
    log_success "🎉 Monitoring setup completed!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Configure alerting policies in Google Cloud Console"
    log_info "2. Set up additional notification channels if needed"
    log_info "3. Customize dashboard widgets as required"
    log_info ""
    log_info "Useful links:"
    log_info "- Monitoring Console: https://console.cloud.google.com/monitoring"
    log_info "- Dashboards: https://console.cloud.google.com/monitoring/dashboards"
    log_info "- Alerting: https://console.cloud.google.com/monitoring/alerting"
}

main "$@"