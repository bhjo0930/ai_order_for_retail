'use client';

import { ResponsiveMobileApp } from '../components/mobile/MobileApp';
import { useState } from 'react';

export default function Home() {
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  
  // WebSocket URL - adjust based on environment
  const websocketUrl = typeof window !== 'undefined' 
    ? (process.env.NODE_ENV === 'development' 
        ? 'ws://localhost:3000/api/voice/stream'
        : `wss://${window.location.host}/api/voice/stream`)
    : undefined;

  return (
    <ResponsiveMobileApp 
      sessionId={sessionId}
      websocketUrl={websocketUrl}
    />
  );
}