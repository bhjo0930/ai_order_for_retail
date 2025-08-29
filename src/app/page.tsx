import VoiceRecorder from "@/components/VoiceRecorder";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="container mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">
          Mobile Voice Ordering System
        </h1>
        <VoiceRecorder />
      </div>
    </main>
  );
}
