// services/script/utils/models.js
import { info, debug } from "#logger.js";
import { putText, putJson, buildPublicUrl } from "#shared/r2-client.js";
import { getIntroPrompt, getMainPrompt, getOutroPromptFull } from "./promptTemplates.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import { attachEpisodeNumberIfNeeded } from "./episodeCounter.js";
import editAndFormat from "./editAndFormat.js";
import chunkText from "./chunkText.js";
import * as sessionCache from "./sessionCache.js";
import { resilientRequest as resilientLLM } from "../../shared/utils/ai-service.js";

function normalizeSessionMeta(sessionIdLike) {
  if (typeof sessionIdLike === "string") return { sessionId: sessionIdLike };
  if (sessionIdLike && typeof sessionIdLike === "object") {
    return {
      sessionId: sessionIdLike.sessionId || sessionIdLike.id || `TT-${Date.now()}`,
      ...sessionIdLike,
    };
  }
  return { sessionId: `TT-${Date.now()}` };
}

// Missing functions restored
export async function generateIntro(sessionMeta) {
  const prompt = await getIntroPrompt(sessionMeta);
  return resilientLLM("scriptIntro", {
    sessionId: sessionMeta.sessionId,
    messages: [{ role: "user", content: prompt }],
  });
}

export async function generateMain(sessionMeta) {
  const prompt = await getMainPrompt(sessionMeta);
  return resilientLLM("scriptMain", {
    sessionId: sessionMeta.sessionId,
    messages: [{ role: "user", content: prompt }],
  });
}

export async function generateOutro(sessionMeta) {
  const prompt = await getOutroPromptFull(sessionMeta);
  return resilientLLM("scriptOutro", {
    sessionId: sessionMeta.sessionId,
    messages: [{ role: "user", content: prompt }],
  });
}

export async function generateComposedEpisode(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
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

  const maxBytes = Number(process.env.MAX_SSML_CHUNK_BYTES || 4200);
  const byteLen = (s) => Buffer.byteLength(s, "utf8");
  let ttsChunks = chunkText(edited, maxBytes);

  await putText("transcripts", `${id}.txt`, edited);

  const files = [];
  for (let i = 0; i < ttsChunks.length; i++) {
    const name = `${id}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
    const body = ttsChunks[i];
    await putText("rawtext", name, body);
    const url = buildPublicUrl("rawtext", name);
    files.push({ index: i + 1, bytes: byteLen(body), url });
  }

  await putJson("meta", `${id}-tts.json`, { chunks: files, total: files.length });

  let meta = await generateEpisodeMetaLLM(edited, sessionMeta);
  meta = await attachEpisodeNumberIfNeeded(meta);
  await putJson("meta", `${id}-meta.json`, meta);

  info("📃 Script orchestration complete");
  return { transcript: edited, chunks: files, meta };
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
};
