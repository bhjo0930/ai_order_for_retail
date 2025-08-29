import { NextRequest, NextResponse } from 'next/server';

/**
 * Health check endpoint for Google Cloud Run
 * Returns 200 OK if the service is healthy
 */
export async function GET(request: NextRequest) {
  try {
    // Basic health checks
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
    };

    // Optional: Add more comprehensive health checks
    // - Database connectivity
    // - External service availability
    // - Memory usage checks
    
    return NextResponse.json(healthStatus, { status: 200 });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}

// Support HEAD requests for simple health checks
export async function HEAD(request: NextRequest) {
  try {
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    return new NextResponse(null, { status: 503 });
  }
}