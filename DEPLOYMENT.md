# Deploying to Google Cloud Run

This document provides instructions for deploying the mobile voice ordering system to Google Cloud Run.

## Prerequisites

1.  **Google Cloud SDK:** You need to have the `gcloud` CLI installed and configured on your machine.
2.  **Google Cloud Project:** You need a Google Cloud project with billing enabled.
3.  **APIs Enabled:** Make sure the following APIs are enabled in your project:
    - Cloud Build API
    - Cloud Run API
    - Artifact Registry API
    - Cloud Speech-to-Text API
    - Gemini API (or the appropriate Generative AI model API)

## Deployment Steps

### 1. Set Environment Variables

First, set some environment variables in your shell to make the commands easier to write.

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="your-gcp-region" # e.g., us-central1
export SERVICE_NAME="mobile-voice-ordering"
```

### 2. Build the Docker Image

Use Google Cloud Build to build the Docker image and push it to Artifact Registry. This is the recommended way to build container images on GCP.

```bash
gcloud builds submit --tag "${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}"
```

This command will use the `Dockerfile` in the current directory to build the image.

### 3. Deploy to Cloud Run

Deploy the container image to Cloud Run. You will need to provide the environment variables that the application uses.

**Important:** Store your secret keys (like `GEMINI_API_KEY`) in Secret Manager and grant the Cloud Run service account access to them. The command below shows how to pass them as environment variables directly, which is less secure and not recommended for production.

```bash
gcloud run deploy ${SERVICE_NAME} \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/cloud-run-source-deploy/${SERVICE_NAME}" \
  --platform="managed" \
  --region="${REGION}" \
  --allow-unauthenticated \
  --set-env-vars="SUPABASE_URL=your-supabase-url" \
  --set-env-vars="SUPABASE_ANON_KEY=your-supabase-anon-key" \
  --set-env-vars="GEMINI_API_KEY=your-gemini-api-key" \
  --set-env-vars="GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID}"
```

### 4. WebSocket Configuration

Google Cloud Run supports WebSockets. No special configuration is needed for the service itself, as the `next-ws` library handles the WebSocket upgrade requests within the normal HTTP server.

However, you need to ensure that your Cloud Run service has **Session Affinity** enabled if you scale to more than one instance. This ensures that a user's WebSocket connection is always routed to the same container instance.

You can set session affinity when deploying or by updating the service:

```bash
gcloud run deploy ${SERVICE_NAME} \
  --image="..." \
  # ... other flags
  --session-affinity
```

## Conclusion

After these steps, your application should be running on Google Cloud Run and accessible at the URL provided by the deployment command.
