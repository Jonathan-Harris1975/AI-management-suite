import { info, error } from "#logger.js";
import { getObject, listObjects } from "#shared/r2-client.js";
import { orchestrateGeminiTTS } from "./geminiTTS.js";

/**
 * Fetch raw text chunks from R2 for given sessionId
 */
async function fetchRawTextChunks(sessionId) {
  try {
    // List all objects in rawtext bucket
    const objects = await listObjects("rawtext");
    const matched = objects.filter(obj =>
      obj.key.startsWith(`${sessionId}`)
    );

    if (!matched.length) {
      throw new Error(`No raw text found for ${sessionId}`);
    }

    // Sort so chunk_1.txt, chunk_2.txt, etc. are in order
    matched.sort((a, b) => a.key.localeCompare(b.key));

    const chunks = [];
    for (const obj of matched) {
      const content = await getObject("rawtext", obj.key);
      if (content) chunks.push(content);
    }

    if (!chunks.length) {
      throw new Error(`No text chunks found for ${sessionId}`);
    }

    info(`🧩 Loaded ${chunks.length} text chunk(s) from R2`);
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
 * Main TTS orchestration (Gemini)
 */
export async function orchestrateTTS(sessionId) {
  try {
    info("🎙 Starting TTS", { service: "ai-podcast-suite" });

    const chunks = await fetchRawTextChunks(sessionId);
    if (!chunks || !chunks.length) {
      throw new Error("No text chunks found");
    }

    const results = [];
    for (let i = 0; i < chunks.length; i++) {
      const part = chunks[i];
      info(`🔊 Generating TTS for chunk ${i + 1}/${chunks.length}`);
      const audio = await orchestrateGeminiTTS(part, sessionId, i + 1);
      results.push(audio);
    }

    info(`✅ TTS complete for ${sessionId}`);
    return results;
  } catch (err) {
    error("💥 TTS orchestration failed", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
         }
