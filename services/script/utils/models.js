// ============================================================
// 🎧 services/script/utils/models.js — TTS-ready Transcript Pipeline
// ============================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getIntroPrompt, getMainPrompt, getOutroPromptFull } from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { putText, putJson } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import { calculateDuration } from "./durationCalculator.js";
import { getWeatherSummary } from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import editAndFormat from "./editAndFormat.js";
import chunkText from "./chunkText.js";
import { generateMainLongform } from "./mainChunker.js";
import * as sessionCache from "./sessionCache.js";
import { info } from "#logger.js";

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

export async function generateMain(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);

  const { items, feedUrl } = await fetchFeedArticles();
  const articles = (items || []).map((it) => ({
    title: it?.title?.trim() || "",
    summary: it?.summary?.trim() || it?.contentSnippet?.trim() || it?.description?.trim() || "",
    link: it?.link || it?.url || "",
  })).filter(a => a.title || a.summary);

  const { mainSeconds, targetMins } = calculateDuration("main", sessionMeta, articles.length);
  info("script.main.runtimeTarget", { targetMins, mainSeconds, articleCount: articles.length, feedUrl });

  const combined = await generateMainLongform(sessionMeta, articles, mainSeconds);
  return sanitizeOutput(combined);
}

export async function generateOutro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const prompt = await getOutroPromptFull(sessionMeta);

  const res = await resilientRequest("scriptOutro", {
    sessionId: sessionMeta,
    section: "outro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "outro", cleaned);
  return cleaned;
}

export async function generateComposedEpisode(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);

  const introCached = await sessionCache.getTempPart(sessionMeta, "intro");
  const mainCached = await sessionCache.getTempPart(sessionMeta, "main");
  const outroCached = await sessionCache.getTempPart(sessionMeta, "outro");

  const intro = introCached || await generateIntro(sessionMeta);
  const main = mainCached || await generateMain(sessionMeta);
  const outro = outroCached || await generateOutro(sessionMeta);

  const rawTranscript = [intro, "", main, "", outro].join("\n");

  const edited = editAndFormat(rawTranscript);

  const ttsChunks = chunkText(edited) || [];
  const ttsMeta = ttsChunks.map((chunk, i) => ({ index: i + 1, length: chunk?.length || 0 }));

  const id = sessionMeta.sessionId || "episode";

  await putText("raw-text", `${id}.txt`, edited);
  await putText("transcripts", `${id}.txt`, edited);
  await putJson("meta", `${id}.json`, {
    session: sessionMeta,
    createdAt: new Date().toISOString(),
    ttsChunks: ttsMeta,
    durations: {
      ...calculateDuration("intro", sessionMeta),
      ...calculateDuration("main", sessionMeta),
      ...calculateDuration("outro", sessionMeta),
    },
  });

  return { transcript: edited, session: sessionMeta, ttsChunks: ttsMeta };
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
};
