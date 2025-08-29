'use client';

import { useReducer, useRef, useEffect } from 'react';

// State and Reducer for complex state management
type State = {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  transcript: string;
  partialTranscript: string;
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  geminiHistory: any[]; // History for the Gemini API
};

type Action =
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'SET_PARTIAL_TRANSCRIPT'; payload: string }
  | { type: 'FINALIZE_TRANSCRIPT'; payload: string }
  | { type: 'START_PROCESSING' }
  | { type: 'ADD_ASSISTANT_RESPONSE'; payload: { response: string; history: any[] } }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: State = {
  isRecording: false,
  isProcessing: false,
  error: null,
  transcript: '',
  partialTranscript: '',
  chatHistory: [],
  geminiHistory: [],
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'START_RECORDING':
      return { ...state, isRecording: true, transcript: '', partialTranscript: '', error: null };
    case 'STOP_RECORDING':
      return { ...state, isRecording: false };
    case 'SET_PARTIAL_TRANSCRIPT':
      return { ...state, partialTranscript: action.payload };
    case 'FINALIZE_TRANSCRIPT':
      return {
        ...state,
        transcript: action.payload,
        partialTranscript: '',
        chatHistory: [...state.chatHistory, { role: 'user', content: action.payload }],
      };
    case 'START_PROCESSING':
        return { ...state, isProcessing: true, error: null };
    case 'ADD_ASSISTANT_RESPONSE':
      return {
        ...state,
        isProcessing: false,
        chatHistory: [...state.chatHistory, { role: 'assistant', content: action.payload.response }],
        geminiHistory: action.payload.history,
      };
    case 'SET_ERROR':
      return { ...state, isRecording: false, isProcessing: false, error: action.payload };
    default:
      return state;
  }
}

const VoiceRecorder = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
      mediaRecorderRef.current?.stop();
    };
  }, []);

  const handleOrchestratorCall = async (text: string) => {
    dispatch({ type: 'START_PROCESSING' });
    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, history: state.geminiHistory }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'API call failed');
      dispatch({ type: 'ADD_ASSISTANT_RESPONSE', payload: data });
    } catch (error) {
      console.error('Error calling orchestrator:', error);
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      dispatch({ type: 'SET_ERROR', payload: `Assistant Error: ${message}` });
    }
  };

  const startRecording = async () => {
    dispatch({ type: 'START_RECORDING' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socketRef.current = new WebSocket(`${wsProtocol}//${window.location.host}/api/speech`);

      socketRef.current.onerror = () => {
        dispatch({ type: 'SET_ERROR', payload: 'Voice connection failed. Please try again.' });
      };
      socketRef.current.onclose = () => {
        dispatch({ type: 'STOP_RECORDING' });
      };

      socketRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.isFinal) {
          const finalTranscript = state.transcript + state.partialTranscript + data.text;
          dispatch({ type: 'FINALIZE_TRANSCRIPT', payload: finalTranscript.trim() });
          handleOrchestratorCall(finalTranscript.trim());
        } else {
          dispatch({ type: 'SET_PARTIAL_TRANSCRIPT', payload: data.text });
        }
      };

      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = (e) => socketRef.current?.send(e.data);
      mediaRecorderRef.current.start(500);
    } catch (error) {
      console.error('Could not start recording:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Microphone access denied. Please enable it in your browser settings.' });
    }
  };

  const stopRecording = () => {
    dispatch({ type: 'STOP_RECORDING' });
    mediaRecorderRef.current?.stop();
    socketRef.current?.close();
  };

  return (
    <div className="flex flex-col h-[600px] w-full max-w-md mx-auto bg-white shadow-xl rounded-lg">
      <div className="p-4 border-b">
        <h2 className="text-xl font-bold text-center">Voice Assistant</h2>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        {state.chatHistory.map((msg, index) => (
          <div key={index} className={`chat ${msg.role === 'user' ? 'chat-end' : 'chat-start'}`}>
            <div className={`chat-bubble ${msg.role === 'assistant' ? 'chat-bubble-primary' : ''}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {state.partialTranscript && <p className="text-gray-500 italic">{state.partialTranscript}</p>}
        {state.isProcessing && <p className="text-blue-500">Assistant is thinking...</p>}
        {state.error && <div className="text-red-500 p-2 my-2 bg-red-100 rounded">Error: {state.error}</div>}
      </div>
      <div className="p-4 border-t">
        <button
          onClick={state.isRecording ? stopRecording : startRecording}
          className={`w-full px-4 py-3 rounded-full font-semibold text-white transition-colors ${
            state.isRecording ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'
          }`}
          disabled={state.isProcessing}
        >
          {state.isProcessing ? 'Processing...' : state.isRecording ? 'Stop Listening' : 'Start Listening'}
        </button>
      </div>
    </div>
  );
};

export default VoiceRecorder;
