import { NextRequest, NextResponse } from 'next/server';
import { processUserInput } from '@/lib/gemini';
import { Content } from '@google/generative-ai';
import { search_catalog, add_to_cart } from '@/lib/agents/productAgent';
import { validate_coupon } from '@/lib/agents/couponAgent';
import { create_order, initiate_payment } from '@/lib/agents/orderAgent';
import { logger } from '@/lib/logger';

// Map function names to their implementations
const agentFunctions: { [key:string]: (...args: any[]) => any } = {
  search_catalog,
  add_to_cart,
  validate_coupon,
  create_order,
  initiate_payment,
};

export async function POST(req: NextRequest) {
  try {
    const { text, history } = await req.json();

    if (!text) {
      return NextResponse.json({ error: 'Text input is required' }, { status: 400 });
    }

    let currentHistory: Content[] = history || [];
    let response = await processUserInput(text, currentHistory);

    while (response && response.parts.some(part => part.functionCall)) {
      const functionCalls = response.parts
        .filter(part => part.functionCall)
        .map(part => part.functionCall);

      const functionCall = functionCalls[0]; // Handle one function call at a time for simplicity

      if (functionCall) {
        const functionToCall = agentFunctions[functionCall.name];
        if (functionToCall) {
          try {
            const result = await functionToCall(functionCall.args);

            // Add the function call and result to the history
            currentHistory.push(response);
            currentHistory.push({
              role: 'function',
              parts: [{ functionResponse: { name: functionCall.name, response: result } }],
            });

            // Send the result back to the model to get the final response
            response = await processUserInput(text, currentHistory);

          } catch (e) {
            const message = e instanceof Error ? e.message : 'An unknown error occurred.';
            logger.error(`Error executing function ${functionCall.name}`, { error: message });
            // It's often better to let the LLM know the tool failed
            // so it can respond appropriately to the user.
            currentHistory.push({
                role: 'function',
                parts: [{ functionResponse: { name: functionCall.name, response: { error: `Tool failed: ${message}` } } }],
            });
            response = await processUserInput(text, currentHistory);
          }
        } else {
          // Function not found, return an error
          return NextResponse.json({ error: `Function ${functionCall.name} not found` }, { status: 400 });
        }
      }
    }

    // When the model returns a text response, send it to the client
    const finalResponse = response?.parts.map(part => part.text).join('') || '';
    currentHistory.push(response!);

    return NextResponse.json({ response: finalResponse, history: currentHistory });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    logger.error('Error in orchestrator', { error: message });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
