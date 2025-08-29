import { NextRequest } from 'next/server';

// This file serves as a placeholder for the WebSocket route
// The actual WebSocket server is initialized in the server setup

export async function GET(request: NextRequest) {
  return new Response('WebSocket endpoint - use WebSocket connection', {
    status: 426,
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
    },
  });
}

export async function POST(request: NextRequest) {
  return new Response('WebSocket endpoint - use WebSocket connection', {
    status: 405,
    headers: {
      'Allow': 'GET',
    },
  });
}