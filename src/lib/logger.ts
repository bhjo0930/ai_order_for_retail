// A simple structured logger for Google Cloud Logging
// See: https://cloud.google.com/logging/docs/structured-logging

type LogSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

interface LogEntry {
    message: string;
    severity: LogSeverity;
    timestamp: string;
    context?: Record<string, any>;
}

const log = (severity: LogSeverity, message: string, context: Record<string, any> = {}) => {
    if (process.env.NODE_ENV === 'test') return; // Don't log in test environment

    const entry: LogEntry = {
        severity,
        message,
        timestamp: new Date().toISOString(),
        ...context,
    };

    // In a real app, you might use a more robust logging library like Pino or Winston,
    // but for this project, a simple JSON logger is sufficient.
    console.log(JSON.stringify(entry));
};

export const logger = {
    debug: (message: string, context?: Record<string, any>) => log("DEBUG", message, context),
    info: (message: string, context?: Record<string, any>) => log("INFO", message, context),
    warn: (message: string, context?: Record<string, any>) => log("WARNING", message, context),
    error: (message: string, context?: Record<string, any>) => log("ERROR", message, context),
    critical: (message: string, context?: Record<string, any>) => log("CRITICAL", message, context),
};
