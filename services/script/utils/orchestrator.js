// services/script/utils/orchestrator.js
import { info, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { generateIntro } from "../routes/intro.js";
import { generateMain } from "../routes/main.js";
import { generateOutro } from "../routes/outro.js";
import { composeEpisode } from "../routes/compose.js";

/**
 * Split long text into manageable chunks for TTS
 */
function splitTextIntoChunks(text, maxBytes = 4000) {
  const chunks = [];
  let buffer = "";
  for (const line of text.split(/\n+/)) {
    if (Buffer.byteLength(buffer + line, "utf8") > maxBytes) {
      chunks.push(buffer.trim());
      buffer = "";
    }
    buffer += line + "\n";
  }
  if (buffer.trim()) chunks.push(buffer.trim());
  return chunks;
}

/**
 * Save raw text chunks to R2 using sessionId as prefix
 */
async function saveRawText(sessionId, text) {
  try {
    const chunks = splitTextIntoChunks(text);
    const urls = [];

    for (let i = 0; i < chunks.length; i++) {
      const key = chunks.length > 1
        ? `${sessionId}_${i + 1}.txt`
        : `${sessionId}.txt`;

      await putObject("rawtext", key, chunks[i], {
        "Content-Type": "text/plain; charset=utf-8",
      });

      const publicUrl = `${process.env.R2_PUBLIC_BASE_URL_RAW_TEXT}/${key}`;
      urls.push(publicUrl);
      info(`💾 Saved raw chunk ${i + 1}/${chunks.length} → ${key}`);
    }

    return urls;
  } catch (err) {
    error("💥 Failed to save raw text chunks", { sessionId, error: err.message });
    throw err;
  }
}

/**
 * Save transcript
 */
async function generateTranscript(sessionId, text) {
  const key = `${sessionId}.transcript.txt`;
  await putObject("transcripts", key, text, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  info(`🗒 Transcript saved as ${key}`);
}

/**
 * Save meta
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
  await putObject("meta", key, JSON.stringify(meta, null, 2), {
    "Content-Type": "application/json",
  });
  info(`📄 Meta saved as ${key}`);
}

/**
 * Main Orchestration
 */
export async function orchestrateEpisode(sessionId) {
  info(`🧩 Script orchestration started for ${sessionId}`);
  if (!sessionId) throw new Error("sessionId is required");

  try {
    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);
    const composed = await composeEpisode({ intro, main, outro, sessionId });
    const fullText = composed?.fullText || [intro, main, outro].join("\n\n");

    const rawUrls = await saveRawText(sessionId, fullText);
    await generateTranscript(sessionId, fullText);
    await generateMeta(sessionId, fullText);

    info(`📜 Script pipeline completed for ${sessionId}`);
    return { ok: true, sessionId, fullText, rawUrls };
  } catch (err) {
    error("💥 Script orchestration failed", { sessionId, error: err.message });
    throw err;
  }
}

export default orchestrateEpisode;
