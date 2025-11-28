// services/script/orchestrator.js
import { info, error, debug } from "#logger.js";
import models from "./models.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "./chunkText.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import * as sessionCache from "./sessionCache.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";
import { attachEpisodeNumberIfNeeded } from "./episodeCounter.js";

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

export async function orchestrateScript(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
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

    const editorialText = await resilientRequest("editorialPass", {
      sessionId: sid,
      messages: [
        { role: "system", content: "Editorial cleanup for cohesion and tone." },
        { role: "user", content: initialFullText },
      ],
    });

    const formattedText = await resilientRequest("editAndFormat", {
      sessionId: sid,
      messages: [
        { role: "system", content: "Format for podcast delivery." },
        { role: "user", content: editorialText },
      ],
    });

    const finalFullText =
      formattedText?.trim() || editorialText?.trim() || initialFullText;

    const chunks = chunkText(finalFullText);
    const uploadedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
    }

    await uploadText("transcript", `${sid}.txt`, finalFullText, "text/plain");

    let meta = await generateEpisodeMetaLLM(finalFullText, sid);
    meta = await attachEpisodeNumberIfNeeded(meta);

    const metaKey = `${sid}.json`;
    await uploadText("meta", metaKey, JSON.stringify(meta, null, 2), "application/json");

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
