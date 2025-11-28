// services/script/utils/models.js
// ============================================================
// 🧠 Script Models — intro / main / outro / composed episode
// ============================================================

import { info, debug } from "#logger.js";
import { putText, putJson, buildPublicUrl } from "#shared/r2-client.js";
import { generateIntro, generateMain, generateOutro } from "./promptTemplates.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import { attachEpisodeNumberIfNeeded } from "./episodeCounter.js";
import editAndFormat from "./editAndFormat.js";
import chunkText from "./chunkText.js";
import * as sessionCache from "./sessionCache.js";

// ------------------------------------------------------------
// 🔧 Replacement for missing ./sessionMeta.js
// ------------------------------------------------------------
function normalizeSessionMeta(sessionIdLike) {
  // If a string is provided, treat it as sessionId
  if (typeof sessionIdLike === "string") {
    return { sessionId: sessionIdLike };
  }

  // If object, ensure a sessionId exists
  if (sessionIdLike && typeof sessionIdLike === "object") {
    return {
      sessionId:
        sessionIdLike.sessionId ||
        sessionIdLike.id ||
        `TT-${Date.now()}`,
      ...sessionIdLike,
    };
  }

  // Fallback
  return { sessionId: `TT-${Date.now()}` };
}

// ------------------------------------------------------------
// 🧩 Main composition engine
// ------------------------------------------------------------
function calculateDuration(section, sessionMeta, articleCount) {
  return { mainSeconds: 0, targetMins: 0 };
}

export async function generateComposedEpisode(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const id = sessionMeta.sessionId || `TT-${Date.now()}`;

  // ---- INTRO ----
  const intro =
    (await sessionCache.getTempPart(sessionMeta, "intro")) ||
    (await generateIntro(sessionMeta));

  // ---- MAIN ----
  const main =
    (await sessionCache.getTempPart(sessionMeta, "main")) ||
    (await generateMain(sessionMeta));

  // ---- OUTRO ----
  const outro =
    (await sessionCache.getTempPart(sessionMeta, "outro")) ||
    (await generateOutro(sessionMeta));

  // Combine into a transcript
  const rawTranscript = [intro, "", main, "", outro].join("\n");
  const edited = editAndFormat(rawTranscript);

  // ------------------------------------------------------------
  // 🔊 TTS Chunking
  // ------------------------------------------------------------
  const maxBytes = Number(process.env.MAX_SSML_CHUNK_BYTES || 4200);
  const byteLen = (s) => Buffer.byteLength(s, "utf8");
  let ttsChunks = chunkText(edited, maxBytes);

  if (ttsChunks.length <= 1 && byteLen(edited) > maxBytes) {
    debug("Force splitting large chunk", { reason: "single-chunk-too-large" });

    const out = [];
    let remaining = edited.trim();

    while (Buffer.byteLength(remaining, "utf8") > maxBytes) {
      const approx = Math.floor(maxBytes * 0.9);
      const slice = remaining.slice(0, approx);
      const cut = slice.lastIndexOf(" ");
      const chunk = slice.slice(0, cut > 200 ? cut : approx);
      out.push(chunk.trim());
      remaining = remaining.slice(chunk.length).trim();
    }

    if (remaining) out.push(remaining);
    ttsChunks = out;
  }

  // Save transcript
  await putText("transcripts", `${id}.txt`, edited);

  // Save chunks
  const files = [];
  for (let i = 0; i < ttsChunks.length; i++) {
    const name = `${id}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
    const body = ttsChunks[i];
    await putText("rawtext", name, body);

    const url = buildPublicUrl("rawtext", name);
    files.push({ index: i + 1, bytes: byteLen(body), url });
  }

  // Save TTS meta
  await putJson("meta", `${id}-tts.json`, {
    chunks: files,
    total: files.length,
  });

  // ------------------------------------------------------------
  // 🧠 Generate Episode Meta via LLM
  // ------------------------------------------------------------
  let meta = await generateEpisodeMetaLLM(edited, sessionMeta);

  // Attach episode number if needed
  try {
    meta = await attachEpisodeNumberIfNeeded(meta);
  } catch (err) {
    debug("episodeNumber.attach.fail", {
      sessionId: id,
      error: String(err),
    });
  }

  await putJson("meta", `${id}-meta.json`, meta);

  info("📃 Script orchestration complete");
  debug("📃 Script orchestration complete", {
    sessionId: id,
    chunks: files.length,
  });

  return { transcript: edited, chunks: files, meta };
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
};
