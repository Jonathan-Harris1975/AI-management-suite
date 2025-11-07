import { info, error } from "#logger.js";
import { putObject } from "#shared/r2-client.js";
import { generateIntro } from "../routes/intro.js";
import { generateMain } from "../routes/main.js";
import { generateOutro } from "../routes/outro.js";
import { composeEpisode } from "../routes/compose.js";

/**
 * Split long text into chunks (for TTS)
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
 * Save raw text chunks to R2
 */
async function saveRawText(sessionId, text) {
  try {
    const chunks = splitTextIntoChunks(text);
    const urls = [];

    for (let i = 0; i < chunks.length; i++) {
      const key =
        chunks.length > 1
          ? `${sessionId}_${i + 1}.txt`
          : `${sessionId}.txt`;

      // Only pass 3 arguments — your r2-client handles headers internally
      await putObject("rawtext", key, chunks[i]);

      const publicUrl = `${process.env.R2_PUBLIC_BASE_URL_RAW_TEXT}/${key}`;
      urls.push(publicUrl);
      info(`💾 Saved raw chunk ${i + 1}/${chunks.length} → ${key}`);
    }

    if (urls.length === 0) {
      throw new Error("No text chunks were created");
    }

    return urls;
  } catch (err) {
    error("💥 Failed to save raw text chunks", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Save transcript to R2
 */
async function saveTranscript(sessionId, text) {
  try {
    const key = `${sessionId}.transcript.txt`;
    await putObject("transcripts", key, text);
    info(`🗒 Transcript saved as ${key}`);
    return `${process.env.R2_PUBLIC_BASE_URL_TRANSCRIPTS}/${key}`;
  } catch (err) {
    error("💥 Failed to save transcript", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Save metadata to R2
 */
async function saveMeta(sessionId, text) {
  try {
    const key = `${sessionId}.meta.json`;
    const meta = {
      sessionId,
      title: `AI Weekly Podcast – ${sessionId}`,
      summary: text.slice(0, 250) + "...",
      wordCount: text.split(/\s+/).length,
      timestamp: new Date().toISOString(),
    };

    await putObject("meta", key, JSON.stringify(meta, null, 2));
    info(`📄 Meta saved as ${key}`);
    return `${process.env.R2_PUBLIC_BASE_URL_META}/${key}`;
  } catch (err) {
    error("💥 Failed to save meta", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
}

/**
 * Master Orchestration
 */
export async function orchestrateEpisode(sessionId) {
  info(`🧩 Script orchestration started for ${sessionId}`);
  if (!sessionId) throw new Error("sessionId is required");

  try {
    // Generate episode parts
    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    const composed = await composeEpisode({
      intro,
      main,
      outro,
      sessionId,
    });

    const fullText = composed?.fullText || [intro, main, outro].join("\n\n");

    // Save outputs to R2
    const rawUrls = await saveRawText(sessionId, fullText);
    const transcriptUrl = await saveTranscript(sessionId, fullText);
    const metaUrl = await saveMeta(sessionId, fullText);

    info(`📜 Script pipeline completed for ${sessionId}`);
    return {
      ok: true,
      sessionId,
      fullText,
      rawUrls,
      transcriptUrl,
      metaUrl,
    };
  } catch (err) {
    error("💥 Script orchestration failed", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
}

export default orchestrateEpisode;
