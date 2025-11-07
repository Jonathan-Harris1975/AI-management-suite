// test-tts.js – Gemini-only
import { processTTS } from "./utils/ttsProcessor.js";

async function runTest() {
  try {
    const [sessionId, voiceName] = process.argv.slice(2);
    if (!sessionId) {
      console.error("❌ Usage: node test-tts.js <sessionId> [voiceName]");
      process.exit(1);
    }
    console.log(`▶️ Running TTS pipeline for sessionId: ${sessionId} voice: ${voiceName || '(default)'}`);
    const res = await processTTS(sessionId, { voiceName });
    console.log("✅ TTS pipeline completed.");
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("❌ TTS pipeline failed:", err.stack || err.message);
    process.exit(1);
  }
}
runTest();
