import scriptLogger from "./script-logger.js";
const { info, warn, error, debug } = scriptLogger;
import { generateIntro, generateMain, generateOutro } from "../utils/models.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "../utils/chunkText.js";
import { generateEpisodeMetaLLM } from "../utils/podcastHelper.js";

// ------------------------------------------------------------
// Main orchestrator function
// ------------------------------------------------------------
export async function orchestrateScript(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  scriptLogger.startProcess(sid);
  info("📝 script.orchestrate.start", { sessionId: sid });

  try {
    // 1) Generate sections
    const intro = await generateIntro(sid);
    const main = await generateMain(sid);
    const outro = await generateOutro(sid);

    // 2) Compose human-readable script
    const composed = await composeEpisode({ intro, main, outro, sessionId: sid });

    // 3) Upload full transcript text to raw-text
    const fullText = composed?.fullText || composed?.text || "";
    const uploadKey = `scripts/${sid}.txt`;
    const uploadedUrl = await uploadText("raw-text", uploadKey, fullText);

    // 4) Chunk for TTS
    const maxBytes = Number(process.env.MAX_SSML_CHUNK_BYTES || 4200);
    const chunks = chunkText(fullText, maxBytes);

    const uploadedChunks = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const key = `scripts/${sid}-chunk-${i + 1}.txt`;
      const url = await uploadText("raw-text", key, chunks[i]);
      uploadedChunks.push({ key, url, index: i + 1 });
    }

    // 5) Generate metadata
    const meta = await generateEpisodeMetaLLM(fullText, { sessionId: sid });

    // 6) Log success and return structured result
    info("📗 script.orchestrate.complete", {
      sessionId: sid,
      chunks: uploadedChunks.length,
      hasMeta: Boolean(meta),
    });
    scriptLogger.endProcess({
      sessionId: sid,
      success: true,
      chunks: uploadedChunks.length,
      metaCompleted: Boolean(meta) ? 1 : 0,
    });

    return { ...composed, fullText, chunks: uploadedChunks, metadata: meta || {} };
  } catch (err) {
    error("script.orchestrate.fail", { sessionId: sid, error: String(err), stack: err?.stack });
    scriptLogger.recordError(err);
    scriptLogger.endProcess({ sessionId: sid, success: false });
    throw err;
  }
}

// ------------------------------------------------------------
// Backward-compatible alias + default export
// ------------------------------------------------------------
export const orchestrateEpisode = orchestrateScript;
export default orchestrateScript;
