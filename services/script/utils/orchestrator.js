import { info, error, debug } from "#logger.js";
import models from "./models.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "./chunkText.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import * as sessionCache from "./sessionCache.js";

// UPDATED → ensure this matches the new export
import { attachEpisodeNumberIfNeeded } from "./episodeCounter.js";

import editAndFormat from "./editAndFormat.js";
import { runEditorialPass } from "./editorialPass.js";

const {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
} = models;

function scheduleCleanup(sessionId) {
  setTimeout(async () => {
    try {
      sessionCache.clearSession(sessionId);
    } catch (_) {}
  }, 4 * 60 * 1000);
}

export async function orchestrateScript(input) {
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
    const intro = await generateIntro(sid);
    const main = await generateMain(sid);
    const outro = await generateOutro(sid);

    const composed = await composeEpisode({
      sessionId: sid,
      intro,
      main,
      outro,
    });

    const initialFullText =
      composed?.fullText ?? [intro, main, outro].join("\n\n");

    const editorialText = await runEditorialPass(
      { sessionId: sid, ...sessionMeta },
      initialFullText
    );

    const formattedText = editAndFormat(editorialText || initialFullText);

    const finalFullText =
      (formattedText && formattedText.trim()) ||
      (editorialText && editorialText.trim()) ||
      initialFullText;

    const chunks = chunkText(finalFullText);
    const uploadedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
    }

    await uploadText("transcript", `${sid}.txt`, finalFullText, "text/plain");

    let meta = await generateEpisodeMetaLLM(finalFullText, {
      sessionId: sid,
      date: sessionMeta.date,
      episodeNumber: sessionMeta.episodeNumber,
    });

    // UPDATED → now works because function exists
    meta = await attachEpisodeNumberIfNeeded(meta);

    const metaKey = `${sid}.json`;
    await uploadText(
      "meta",
      metaKey,
      JSON.stringify(meta, null, 2),
      "application/json"
    );

    scheduleCleanup(sid);

    info("✅ Script orchestration complete");
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
