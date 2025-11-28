import { info, debug, warn, error } from "#logger.js";
import { putText, putJson, buildPublicUrl } from "#shared/r2-client.js";

import {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
} from "./promptTemplates.js";

import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import { attachEpisodeNumberIfNeeded } from "./episodeCounter.js";

import editAndFormat from "./editAndFormat.js";
import chunkText from "./chunkText.js";
import * as sessionCache from "./sessionCache.js";

import { resilientRequest as resilientLLM } from "../../shared/utils/ai-service.js";

/* ---------------------------------------------------------
   NORMALISE SESSION META
--------------------------------------------------------- */
export function normalizeSessionMeta(sessionMeta) {
  if (!sessionMeta) {
    return { sessionId: `TT-${Date.now()}` };
  }
  if (typeof sessionMeta === "string") {
    return { sessionId: sessionMeta };
  }
  if (typeof sessionMeta === "object") {
    return {
      sessionId:
        sessionMeta.sessionId ||
        sessionMeta.id ||
        `TT-${Date.now()}`,
      ...sessionMeta,
    };
  }
  return { sessionId: `TT-${Date.now()}` };
}

/* ---------------------------------------------------------
   INTRO
--------------------------------------------------------- */
export async function generateIntro(sessionMetaLike) {
  const sessionMeta = normalizeSessionMeta(sessionMetaLike);
  const prompt = getIntroPrompt({ sessionMeta });

  if (!prompt || !prompt.trim()) {
    throw new Error("Intro prompt came back empty.");
  }

  const result = await resilientLLM("scriptIntro", {
    sessionId: sessionMeta.sessionId,
    messages: [{ role: "user", content: prompt }],
  });

  if (!result || !result.trim()) {
    warn("⚠️ LLM returned empty INTRO — inserting fallback.");
    return "Welcome to this week's episode of Turing's Torch.";
  }

  return result.trim();
}

/* ---------------------------------------------------------
   MAIN
--------------------------------------------------------- */
export async function generateMain(sessionMetaLike) {
  const sessionMeta = normalizeSessionMeta(sessionMetaLike);

  // The main prompt builder expects a shaped object:
  // { sessionMeta, mainSeconds, articles }
  const prompt = getMainPrompt({
    sessionMeta,
    mainSeconds: sessionMeta.mainSeconds, // safe if undefined
    articles: sessionMeta.articles || [],
  });

  if (!prompt || !prompt.trim()) {
    throw new Error("Main prompt came back empty.");
  }

  const result = await resilientLLM("scriptMain", {
    sessionId: sessionMeta.sessionId,
    messages: [{ role: "user", content: prompt }],
  });

  if (!result || !result.trim()) {
    warn("⚠️ LLM returned empty MAIN — inserting fallback.");
    return "This week in artificial intelligence, several important developments emerged.";
  }

  return result.trim();
}

/* ---------------------------------------------------------
   OUTRO
--------------------------------------------------------- */
export async function generateOutro(sessionMetaLike) {
  const sessionMeta = normalizeSessionMeta(sessionMetaLike);
  const prompt = await getOutroPromptFull(sessionMeta);

  if (!prompt || !prompt.trim()) {
    throw new Error("Outro prompt came back empty.");
  }

  const result = await resilientLLM("scriptOutro", {
    sessionId: sessionMeta.sessionId,
    messages: [{ role: "user", content: prompt }],
  });

  if (!result || !result.trim()) {
    warn("⚠️ LLM returned empty OUTRO — inserting fallback.");
    return "Thanks for listening to Turing's Torch.";
  }

  return result.trim();
}

/* ---------------------------------------------------------
   FULL EPISODE GENERATION (LEGACY SUPPORT)
   - Aligns with new orchestrator
   - Safe to keep as fallback
--------------------------------------------------------- */
export async function generateComposedEpisode(sessionMetaLike) {
  const sessionMeta = normalizeSessionMeta(sessionMetaLike);
  const id = sessionMeta.sessionId;

  const intro =
    (await sessionCache.getTempPart(sessionMeta, "intro")) ||
    (await generateIntro(sessionMeta));

  const main =
    (await sessionCache.getTempPart(sessionMeta, "main")) ||
    (await generateMain(sessionMeta));

  const outro =
    (await sessionCache.getTempPart(sessionMeta, "outro")) ||
    (await generateOutro(sessionMeta));

  const rawTranscript = [intro, "", main, "", outro].join("\n");
  const edited = editAndFormat(rawTranscript);

  // Chunk for TTS
  const maxBytes = Number(process.env.MAX_SSML_CHUNK_BYTES || 4200);
  const byteLen = (s) => Buffer.byteLength(s, "utf8");
  const ttsChunks = chunkText(edited, maxBytes);

  // Upload transcript
  await putText("transcript", `${id}.txt`, edited);

  // Upload rawtext chunks
  const files = [];
  for (let i = 0; i < ttsChunks.length; i++) {
    const name = `${id}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
    await putText("rawtext", name, ttsChunks[i]);

    files.push({
      index: i + 1,
      bytes: byteLen(ttsChunks[i]),
      url: buildPublicUrl("rawtext", name),
    });
  }

  // Build metadata
  let meta = await generateEpisodeMetaLLM(edited, sessionMeta);
  meta = await attachEpisodeNumberIfNeeded(meta);

  await putJson("meta", `${id}.json`, meta);

  info("📃 Script composition complete");
  return {
    transcript: edited,
    chunks: files,
    meta,
    sessionId: id,
  };
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
  normalizeSessionMeta,
};
