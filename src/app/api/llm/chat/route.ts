import { NextRequest, NextResponse } from 'next/server';
import { UserInput } from '@/lib/types';

// Lazy load agent router to avoid build-time initialization
const getAgentRouter = async () => {
  const { agentRouter } = await import('@/lib/services/agent-router');
  return agentRouter;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message, type = 'text' } = body;

    if (!sessionId || !message) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, message' },
        { status: 400 }
      );
    }

    // Create user input
    const userInput: UserInput = {
      type: type as 'voice' | 'text',
      content: message,
      timestamp: Date.now(),
      metadata: {
        userAgent: request.headers.get('user-agent'),
        ip: request.headers.get('x-forwarded-for') || 'unknown'
      }
    };

    // Route through agent router
    const agentRouter = await getAgentRouter();
    const result = await agentRouter.routeUserInput(sessionId, userInput);

    if (!result.success) {
      return NextResponse.json(
        { 
          error: 'Processing failed', 
          details: result.error?.userMessage || 'Unknown error' 
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      response: result.response,
      nextState: result.nextState,
      uiUpdates: result.uiUpdates || []
    });

  } catch (error) {
    console.error('Error in LLM chat endpoint:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: '요청을 처리하는 중 오류가 발생했습니다.'
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'LLM Chat API is running',
    endpoints: {
      POST: '/api/llm/chat - Process chat messages',
    },
    version: '1.0.0'
  });
}