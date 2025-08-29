# Logging and Monitoring

This document provides an overview of how logging is implemented in this application and how to monitor it on Google Cloud.

## Structured Logging

The application uses a structured logging format (JSON) for all backend services. This is crucial for effective monitoring and querying in a production environment. All logs are sent to standard output and are automatically collected by Google Cloud Logging when deployed on Cloud Run.

Each log entry is a JSON object with the following fields:
- `severity`: The log level (e.g., `INFO`, `ERROR`).
- `message`: The main log message.
- `timestamp`: The ISO 8601 timestamp of the log event.
- `context`: An optional object containing additional context relevant to the log (e.g., `orderId`, `error`).

### Example Log Entry

```json
{
  "severity": "INFO",
  "message": "Created payment session mock_session_1678886400000 for order abc-123",
  "timestamp": "2025-03-15T12:00:00.000Z"
}
```

## Viewing Logs in Google Cloud

When the application is deployed on Google Cloud Run, you can view the logs in the Google Cloud Console.

1.  Navigate to the **Logs Explorer** in the Google Cloud Console.
2.  In the query builder, you can filter for logs from your Cloud Run service:

    ```
    resource.type="cloud_run_revision"
    resource.labels.service_name="mobile-voice-ordering"
    ```

3.  To view only the structured JSON logs, add `jsonPayload` to the query:

    ```
    resource.type="cloud_run_revision"
    resource.labels.service_name="mobile-voice-ordering"
    jsonPayload.message:*
    ```

### Example Queries

- **Find all error logs:**
  ```
  resource.type="cloud_run_revision"
  resource.labels.service_name="mobile-voice-ordering"
  jsonPayload.severity="ERROR"
  ```

- **Find all logs related to a specific order:**
  ```
  resource.type="cloud_run_revision"
  resource.labels.service_name="mobile-voice-ordering"
  jsonPayload.context.orderDetails.id="abc-123"
  ```

## Monitoring and Alerting

You can use the queries above to create log-based metrics and set up alerting policies in Google Cloud Monitoring. For example, you could create an alert that triggers if the rate of `ERROR` severity logs exceeds a certain threshold.
