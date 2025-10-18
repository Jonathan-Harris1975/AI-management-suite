// services/podcast/runPodcastPipeline.js
import { info, error } from "../shared/utils/logger.js";
import { putJson } from "../shared/utils/r2-client.js";

export default async function runPodcastPipeline(sessionId, text) {
  info("🎙️ Starting podcast pipeline", { sessionId });

  const { orchestrateTTS } = await import("../tts/utils/orchestrator.js").catch(() => ({}));
  let ttsResult = null;
  if (typeof orchestrateTTS === "function") {
    ttsResult = await orchestrateTTS({ sessionId, text });
  } else {
    info("🔊 TTS orchestrator not found — skipping TTS stage", { sessionId });
  }

  const bucket = process.env.R2_BUCKET_PODCAST || process.env.R2_BUCKET_META;
  const key = `podcast/${sessionId}.json`;
  await putJson(bucket, key, { sessionId, text, ttsResult, finishedAt: new Date().toISOString() });

  info("🎙️ Podcast pipeline complete", { sessionId, bucket, key });
  return { sessionId, key, bucket };
}
