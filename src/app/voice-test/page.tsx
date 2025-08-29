import { VoiceRecorderExample } from '../../components/VoiceRecorder';

export default function VoiceTestPage() {
  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="container mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Voice Recording Test
          </h1>
          <p className="text-gray-600">
            Test the Google Cloud Speech-to-Text integration with Korean language support
          </p>
        </div>
        
        <VoiceRecorderExample />
        
        <div className="max-w-2xl mx-auto mt-8 p-6 bg-white rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Test Instructions</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
            <li>Click "Grant Permission" to allow microphone access</li>
            <li>Wait for the "Connected" status indicator</li>
            <li>Click "Start Recording" to begin voice capture</li>
            <li>Speak clearly in Korean or English</li>
            <li>Watch for partial transcription results (yellow box)</li>
            <li>Final transcription will appear in green box</li>
            <li>Click "Stop Recording" when finished</li>
          </ol>
          
          <div className="mt-4 p-3 bg-blue-50 rounded">
            <p className="text-sm text-blue-800">
              <strong>Korean Test Phrases:</strong><br />
              • "안녕하세요, 아메리카노 두 잔 주문하고 싶어요"<br />
              • "피자 한 판 배달 주문할게요"<br />
              • "메뉴 추천해 주세요"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}