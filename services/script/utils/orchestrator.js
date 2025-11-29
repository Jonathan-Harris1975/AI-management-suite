// services/script/utils/orchestrator.js
// ============================================================
// 🎛️ Master Script Orchestrator
//   - Calls models.generateIntro/Main/Outro
//   - Runs editorial pass + humaniser
//   - Chunks for TTS & uploads raw text
//   - Uploads full transcript
//   - Generates & stores episode metadata
//   - Attaches episode number via metasystem counter
// ============================================================

import { info, error, debug } from "#logger.js";
import models from "./models.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "./chunkText.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import * as sessionCache from "./sessionCache.js";
import { attachEpisodeNumberIfNeeded } from "./episodeCounter.js";
import editAndFormat from "./editAndFormat.js";
import { runEditorialPass } from "./editorialPass.js";

const { generateIntro, generateMain, generateOutro } = models;

function scheduleCleanup(sessionId) {
  setTimeout(async () => {
    try {
      sessionCache.clearSession(sessionId);
    } catch (_) {
      // ignore cleanup errors
    }
  }, 4 * 60 * 1000);
}

export async function orchestrateScript(input) {
  // Allow both legacy string sessionId and richer session meta object
  const sessionMeta =
    typeof input === "string"
      ? { sessionId: input }
      : input && typeof input === "object"
      ? { ...input }
      : {};

  const sid =
    sessionMeta.sessionId ||
    sessionMeta.id ||
    `TT-${new Date().toISOString().slice(0, 10)}`;

  sessionMeta.sessionId = sid;

  debug("🧠 Orchestrate Script: start", { sessionId: sid });

  try {
    // --------------------------------------------------------
    // 1. Core sections
    // --------------------------------------------------------
    const intro = await generateIntro(sid);
    const main = await generateMain(sid);
    const outro = await generateOutro(sid);

    // --------------------------------------------------------
    // 2. High-level episode composition (structure markers, etc.)
    // --------------------------------------------------------
    const composed = await composeEpisode({
      sessionId: sid,
      intro,
      main,
      outro,
    });

    const initialFullText =
      composed?.fullText ?? [intro, main, outro].join("\n\n");

    // --------------------------------------------------------
    // 3. Optional editorial pass (LLM-based, guarded by env flag)
    // --------------------------------------------------------
    const editorialText = await runEditorialPass(
      { sessionId: sid, ...sessionMeta },
      initialFullText
    );

    // --------------------------------------------------------
    // 4. Lightweight formatting + humanisation (local, not LLM)
    // --------------------------------------------------------
    const formattedText = editAndFormat(editorialText || initialFullText);

    const finalFullText =
      (formattedText && formattedText.trim()) ||
      (editorialText && editorialText.trim()) ||
      initialFullText;

    // --------------------------------------------------------
    // 5. Chunk for TTS + R2 upload (raw text)
    // --------------------------------------------------------
    const chunks = chunkText(finalFullText);
    const uploadedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
    }

    // --------------------------------------------------------
    // 6. Full transcript upload
    // --------------------------------------------------------
    await uploadText("transcript", `${sid}.txt`, finalFullText, "text/plain");

    // --------------------------------------------------------
    // 7. LLM-driven metadata (title, description, SEO, artwork prompt)
    // --------------------------------------------------------
    let meta = await generateEpisodeMetaLLM(finalFullText, {
      sessionId: sid,
      date: sessionMeta.date,
      episodeNumber: sessionMeta.episodeNumber,
    });

    // Attach / increment episode number via metasystem counter
    meta = await attachEpisodeNumberIfNeeded(meta);

    // Ensure core fields present
    meta.session = meta.session || {};
    meta.session.sessionId = sid;
    if (!meta.pubDate) {
      meta.pubDate = new Date().toUTCString();
    }

    const metaKey = `${sid}.json`;

    await uploadText(
      "meta",
      metaKey,
      JSON.stringify(meta, null, 2),
      "application/json"
    );

    // --------------------------------------------------------
    // 8. Cleanup session cache
    // --------------------------------------------------------
    scheduleCleanup(sid);

    info("✅ Script orchestration complete", {
      sessionId: sid,
      chunks: uploadedChunks.length,
    });

    return {
      ...composed,
      fullText: finalFullText,
      chunks: uploadedChunks,
      metadata: meta,
    };
  } catch (err) {
    error("💥 Script orchestration failed", {
      sessionId: sid,
      error: err?.message,
      stack: err?.stack,
    });
    throw err;
  }
}

export const orchestrateEpisode = orchestrateScript;
export default orchestrateScript;
