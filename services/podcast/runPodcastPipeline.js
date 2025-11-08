
// 🎙 AI Podcast Pipeline — Working Orchestrator
import { info, error } from "#logger.js";
import { orchestrateScript } from "../script/utils/orchestrator.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { generateArtwork } from "../artwork/routes/generateArtwork.js";
import { uploadText } from "#shared/r2-client.js";

export async function runPodcastPipeline(sessionId, options = {}){
  info({ sessionId }, "🎧 Starting AI Podcast Pipeline...");
  if(!sessionId) throw new Error("sessionId is required");

  // 1) Script
  const script = await orchestrateScript(sessionId, options.script || {});

  // 2) TTS
  const tts = await orchestrateTTS(sessionId, { scriptText: script.text, ...(options.tts||{}) });

  // 3) Artwork
  const art = await generateArtwork(sessionId, options.artwork || {});

  // 4) Metadata
  const metadata = {
    sessionId,
    createdAt: new Date().toISOString(),
    script: { bytes: script.text.length },
    tts: { file: tts.file, durationSec: tts.durationSec },
    artwork: { key: art.key }
  };
  await uploadText("meta", `${sessionId}.meta.json`, JSON.stringify(metadata,null,2), "application/json");

  return { ok: true, sessionId, metadata };
}

// Simple CLI for local dev: `node services/podcast/runPodcastPipeline.js SESSION123`
if (import.meta.url === `file://${process.argv[1]}`){
  const sessionId = process.argv[2] || `session-${Date.now()}`;
  runPodcastPipeline(sessionId).then(r=>{
    console.log("Pipeline OK:", r);
  }).catch(e=>{
    console.error("Pipeline failed:", e);
    process.exit(1);
  });
}

export default runPodcastPipeline;
