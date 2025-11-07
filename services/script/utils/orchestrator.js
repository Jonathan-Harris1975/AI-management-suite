// services/script/utils/orchestrator.js
import { info, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { generateIntro } from "../routes/intro.js";
import { generateMain } from "../routes/main.js";
import { generateOutro } from "../routes/outro.js";
import { composeEpisode } from "../routes/compose.js";

/**
 * Save raw text to R2 using sessionId as filename
 */
async function saveRawText(sessionId, text) {
  const key = `${sessionId}.txt`;
  try {
    await putObject("rawtext", key, text);
    info(`💾 Raw text saved to R2 as ${key}`);
  } catch (err) {
    error("💥 Failed to save raw text", { sessionId, error: err.message });
    throw err;
  }
}

/**
 * Generate and upload transcript (plain .txt for now)
 */
async function generateTranscript(sessionId, text) {
  const key = `${sessionId}.transcript.txt`;
  try {
    await putObject("transcripts", key, text);
    info(`🗒 Transcript saved to R2 as ${key}`);
  } catch (err) {
    error("💥 Failed to save transcript", { sessionId, error: err.message });
    throw err;
  }
}

/**
 * Generate and upload metadata JSON for podcast episode
 */
async function generateMeta(sessionId, text) {
  const key = `${sessionId}.meta.json`;
  const meta = {
    sessionId,
    title: `AI Weekly Podcast – ${sessionId}`,
    summary: text.slice(0, 200) + "...",
    wordCount: text.split(/\s+/).length,
    timestamp: new Date().toISOString(),
  };
  try {
    await putObject("meta", key, JSON.stringify(meta, null, 2));
    info(`📄 Meta saved to R2 as ${key}`);
  } catch (err) {
    error("💥 Failed to save meta", { sessionId, error: err.message });
    throw err;
  }
}

/**
 * Main Orchestration Entry
 */
export async function orchestrateEpisode(sessionId) {
  info(`🧩 Script orchestration started for ${sessionId}`);

  if (!sessionId) throw new Error("sessionId is required");

  try {
    // 1️⃣ Generate script components
    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    // 2️⃣ Combine text
    const composed = await composeEpisode({ intro, main, outro, sessionId });
    const fullText = composed?.fullText || [intro, main, outro].join("\n\n");

    // 3️⃣ Upload all related files to R2
    await saveRawText(sessionId, fullText);
    await generateTranscript(sessionId, fullText);
    await generateMeta(sessionId, fullText);

    info(`📜 Script pipeline completed for ${sessionId}`);
    return { ok: true, sessionId, fullText };
  } catch (err) {
    error("💥 Script orchestration failed", { sessionId, error: err.message });
    throw err;
  }
}

export default orchestrateEpisode;
