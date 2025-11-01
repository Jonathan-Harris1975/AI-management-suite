// ============================================================
// 🎧 services/script/utils/models.js — Clean Transcript Generator
// ============================================================
//
// - Generates intro, main, and outro segments
// - Fetches weather and Turing quotes dynamically
// - Builds RSS-driven main content
// - Cleans and formats all text
// - Applies humanized final polish via editAndFormat()
// ============================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getIntroPrompt, getMainPrompt, getOutroPromptFull } from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { putText, putJson } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import { calculateDuration } from "./durationCalculator.js";
import { getWeatherSummary } from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import editAndFormat from "./editAndFormat.js"; // ✅ Added
import { info } from "#logger.js";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Intro
// ─────────────────────────────────────────────────────────────
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
  return sanitizeOutput(res);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
export async function generateMain(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const { items, feedUrl } = await fetchFeedArticles();
  const articles = (items || [])
    .map((it) => ({
      title: it?.title?.trim() || "",
      summary: it?.summary?.trim() || it?.description?.trim() || "",
      link: it?.link || it?.url || "",
    }))
    .filter((a) => a.title || a.summary);

  const { mainSeconds, targetMins } = calculateDuration("main", sessionMeta, articles.length);
  info("script.main.runtimeTarget", { targetMins, mainSeconds, articleCount: articles.length, feedUrl });
  const prompt = getMainPrompt({ sessionMeta, articles, mainSeconds });
  const res = await resilientRequest("scriptMain", {
    sessionId: sessionMeta,
    section: "main",
    messages: [{ role: "system", content: prompt }],
  });
  return sanitizeOutput(res);
}

// ─────────────────────────────────────────────────────────────
// Outro
// ─────────────────────────────────────────────────────────────
export async function generateOutro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const prompt = await getOutroPromptFull(sessionMeta);
  const res = await resilientRequest("scriptOutro", {
    sessionId: sessionMeta,
    section: "outro",
    messages: [{ role: "system", content: prompt }],
  });
  return sanitizeOutput(res);
}

// ─────────────────────────────────────────────────────────────
// Compose & Upload
// ─────────────────────────────────────────────────────────────
export async function generateComposedEpisode(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);

  const [intro, main, outro] = await Promise.all([
    generateIntro(sessionMeta),
    generateMain(sessionMeta),
    generateOutro(sessionMeta),
  ]);

  // ✅ Apply editAndFormat to the final transcript only
  const rawTranscript = [intro, "", main, "", outro].join("\n");
  const transcript = editAndFormat(rawTranscript);

  // Upload artifacts
  const id = sessionMeta.sessionId || "episode";
  await putText("transcripts", `${id}.txt`, transcript);
  await putJson("meta", `${id}.json`, {
    session: sessionMeta,
    createdAt: new Date().toISOString(),
    durations: {
      ...calculateDuration("intro", sessionMeta),
      ...calculateDuration("main", sessionMeta),
      ...calculateDuration("outro", sessionMeta),
    },
  });

  return { transcript, session: sessionMeta };
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
};
