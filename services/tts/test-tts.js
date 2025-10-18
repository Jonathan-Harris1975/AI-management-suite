import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../shared/utils/r2-client.js";
// test-tts.js
import { processTextToSpeechPipeline } from './utils/ttsProcessor.js';

async function runTest() {
  try {
    const sessionId = process.argv[2]; // pass sessionId from CLI
    if (!sessionId) {
      console.error("❌ Usage: node test-tts.js <sessionId>");
      process.exit(1);
    }

    console.log(`▶️ Running TTS pipeline for sessionId: ${sessionId}`);

    const uploadedKeys = await processTextToSpeechPipeline(sessionId);

    console.log("✅ TTS pipeline completed.");
    console.log("Uploaded chunk URLs:");
    uploadedKeys.forEach((url, i) => console.log(` [${i}] ${url}`));
  } catch (err) {
    console.error("❌ TTS pipeline failed:", err.message);
    process.exit(1);
  }
}

runTest();
