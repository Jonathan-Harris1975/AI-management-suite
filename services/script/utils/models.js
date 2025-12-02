// services/script/utils/models.js
// ============================================================
// ✨ Generates Intro/Main/Outro → edits → chunked text files
//   stored in raw-text bucket with public URLs for TTS
// ============================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
} from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { putText, putJson, buildPublicUrl } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import { calculateDuration } from "./durationCalculator.js";
import { getWeatherSummary } from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import editAndFormat from "./editAndFormat.js";
import chunkText from "./chunkText.js";
import { generateMainLongform } from "./mainChunker.js";
import * as sessionCache from "./sessionCache.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import getSponsor from "./getSponsor.js";
import { info, error, debug } from "#logger.js";

function toPlainText(s) {
  if (!s) return "";
  return String(s)
    .replace(/\[(?:music|sfx|cue|intro|outro|.*?)]/gi, "")
    .replace(/\((?:music|sfx|cue|intro|outro|.*?)]?\)/gi, "")
    .replace(/\*{1,3}/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeOutput(s) {
  return cleanTranscript(toPlainText(s));
}

function normalizeSessionMeta(sessionIdLike) {
  if (typeof sessionIdLike === "string") {
    const m = sessionIdLike.match(/\d{4}-\d{2}-\d{2}/);
    return { sessionId: sessionIdLike, date: m ? m[0] : undefined };
  }
  if (typeof sessionIdLike === "object" && sessionIdLike) {
    return { sessionId: sessionIdLike.sessionId || "", date: sessionIdLike.date };
  }
  return { sessionId: "unknown", date: undefined };
}

export async function generateIntro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const weatherSummary = await getWeatherSummary();
  const turingQuote = await getTuringQuote();
  const prompt = getIntroPrompt({ weatherSummary, turingQuote, sessionMeta });

  const res = await resilientRequest("scriptIntro", {
    sessionId: sessionMeta,
    section: "intro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "intro", cleaned);
  return cleaned;
}

// MAIN – Option A: prompt-driven editorial, longform as fallback
export async function generateMain(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const { items } = await fetchFeedArticles();

  const articles = (items || [])
    .map((it) => ({
      title: it?.title?.trim() || "",
      summary:
        it?.summary?.trim() ||
        it?.contentSnippet?.trim() ||
        it?.description?.trim() ||
        "",
      link: it?.link || it?.url || "",
    }))
    .filter((a) => a.title || a.summary);

  const { mainSeconds, targetMins } = calculateDuration(
    "main",
    sessionMeta,
    articles.length
  );

  debug("Main script generation (Option A)", {
    articles: articles.length,
    targetMinutes: targetMins,
    mainSeconds,
  });

  // Primary: single, coherent editorial using the new prompt
  const mainPrompt = getMainPrompt({
    articles,
    sessionMeta,
  });

  const res = await resilientRequest("scriptMain", {
    sessionId: sessionMeta,
    section: "main",
    messages: [{ role: "system", content: mainPrompt }],
  });

  let cleaned = sanitizeOutput(res);
  const wordCount = cleaned ? cleaned.split(/\s+/).length : 0;

  // If the main section comes out too thin, fall back to longform generator
  if (!cleaned || wordCount < 250) {
    debug("Main section too short; falling back to longform generator", {
      wordCount,
    });

    const combined = await generateMainLongform(sessionMeta, articles, mainSeconds);
    await sessionCache.storeTempPart(sessionMeta, "main", combined);
    return sanitizeOutput(combined);
  }

  await sessionCache.storeTempPart(sessionMeta, "main", cleaned);
  return cleaned;
}

// OUTRO – Sponsor + CTA wired correctly
export async function generateOutro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);

  // Load a sponsor book from books.json (or fallback)
  const book = getSponsor();

  const prompt = getOutroPromptFull(book, sessionMeta);

  const res = await resilientRequest("scriptOutro", {
    sessionId: sessionMeta,
    section: "outro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "outro", cleaned);
  debug("Outro generated with sponsor", {
    sessionId: sessionMeta.sessionId,
    sponsorTitle: book?.title,
    sponsorUrl: book?.url,
  });
  return cleaned;
}

export async function generateComposedEpisode(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const id = sessionMeta.sessionId || `TT-${Date.now()}`;

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

  const meta = await generateEpisodeMetaLLM(edited, sessionMeta);
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
