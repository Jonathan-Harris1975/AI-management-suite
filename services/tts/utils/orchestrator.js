import { info, error } from "#logger.js";
import { getObject, listObjects } from "#shared/r2-client.js";
import { processTTS } from "./ttsProcessor.js"; // ✅ existing file
import { splitTextIntoChunks } from "./textchunksR2.js"; // ✅ existing file

/**
 * Fetch raw text chunks from R2 for the given sessionId
 */
async function fetchRawTextChunks(sessionId) {
  try {
    const objects = await listObjects("rawtext");
    const matched = objects.filter(obj => obj.key.startsWith(`${sessionId}`));

    if (!matched.length) {
      throw new Error(`No raw text found for ${sessionId}`);
    }

    matched.sort((a, b) => a.key.localeCompare(b.key));

    const chunks = [];
    for (const obj of matched) {
      const content = await getObject("rawtext", obj.key);
      if (content) chunks.push(content);
    }

    if (!chunks.length) {
      throw new Error(`No text chunks found for ${sessionId}`);
    }

    info(`🧩 Loaded ${chunks.length} text chunk(s) from R2 for ${sessionId}`);
    return chunks;
  } catch (err) {
    error("💥 Failed to fetch raw text chunks", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Main TTS orchestration (Gemini / Google)
 */
export async function orchestrateTTS(sessionId) {
  try {
    info("🎙 Starting TTS orchestration", { service: "ai-podcast-suite" });

    // Get all raw text chunks
    const chunks = await fetchRawTextChunks(sessionId);

    // Safety: split large single chunk if needed
    const expandedChunks = [];
    for (const chunk of chunks) {
      const subChunks = splitTextIntoChunks(chunk);
      expandedChunks.push(...subChunks);
    }

    if (!expandedChunks.length) {
      throw new Error("No usable text chunks after splitting");
    }

    const results = [];
    for (let i = 0; i < expandedChunks.length; i++) {
      const textPart = expandedChunks[i];
      info(`🔊 Generating TTS for chunk ${i + 1}/${expandedChunks.length}`);
      const audioUrl = await processTTS(textPart, sessionId, i + 1);
      results.push(audioUrl);
    }

    info(`✅ TTS orchestration complete for ${sessionId}`, {
      chunksProcessed: results.length,
    });
    return results;
  } catch (err) {
    error("💥 TTS orchestration failed", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
}
