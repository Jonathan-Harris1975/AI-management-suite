// services/script/utils/models.js
// Enhanced compose flow: more human intro, no RSS references in main,
// TTS-friendly outro, optimized chunk size for AWS Polly natural,
// and podcast metadata includes episode number (intro ignored).

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getIntroPrompt, getMainPrompt, getOutroPromptFull } from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { putText, putJson } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import { calculateDuration } from "./durationCalculator.js";
import { getWeatherSummary } from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import editAndFormat from "./editAndFormat.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import * as sessionCache from "./sessionCache.js";
import { info } from "#logger.js";

// --- Helper Functions ---
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

// --- Generate Intro (more human-like) ---
export async function generateIntro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const weatherSummary = await getWeatherSummary();
  const turingQuote = await getTuringQuote();

  const prompt = `Write a warm, conversational podcast intro for "AI Weekly".
It should sound natural, friendly, and human — not robotic.
Include subtle context like today's weather (“${weatherSummary}”) and a short thoughtful quote (“${turingQuote}”).
Avoid lists, jargon, or overused AI hype.`;

  const res = await resilientRequest("scriptIntro", {
    sessionId: sessionMeta,
    section: "intro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "intro", cleaned);
  return cleaned;
}

// --- Generate Main (no RSS feed references) ---
export async function generateMain(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const { items } = await fetchFeedArticles();
  const articles = (items || []).map((it) => ({
    title: it?.title?.trim() || "",
    summary: it?.summary?.trim() || it?.contentSnippet?.trim() || it?.description?.trim() || "",
  })).filter(a => a.title || a.summary);

  const { mainSeconds, targetMins } = calculateDuration("main", sessionMeta, articles.length);
  info("script.main.runtimeTarget", { targetMins, mainSeconds, articleCount: articles.length });

  const mainPrompt = `Create a natural, insightful discussion about current AI news and innovations.
Do NOT mention RSS feeds, websites, or data sources. Keep tone human, balanced, and conversational.`;

  const res = await resilientRequest("scriptMain", {
    sessionId: sessionMeta,
    section: "main",
    messages: [{ role: "system", content: mainPrompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "main", cleaned);
  return cleaned;
}

// --- Generate Outro (TTS-friendly) ---
export async function generateOutro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);

  const prompt = `Write a short podcast outro for "AI Weekly".
Make it smooth and TTS-friendly — avoid URLs or abbreviations like "https".
Instead of saying "https://Jonathan-Harris.online", say "Visit Jonathan-Harris dot online".
Keep it friendly and grateful.`;

  const res = await resilientRequest("scriptOutro", {
    sessionId: sessionMeta,
    section: "outro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "outro", cleaned);
  return cleaned;
}

// --- Compose and Upload (optimized for AWS Polly natural) ---
export async function generateComposedEpisode(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);

  const introCached = await sessionCache.getTempPart(sessionMeta, "intro");
  const mainCached  = await sessionCache.getTempPart(sessionMeta, "main");
  const outroCached = await sessionCache.getTempPart(sessionMeta, "outro");

  const intro = introCached || await generateIntro(sessionMeta);
  const main  = mainCached  || await generateMain(sessionMeta);
  const outro = outroCached || await generateOutro(sessionMeta);

  const rawTranscript = [intro, "", main, "", outro].join("\n");
  const edited = editAndFormat(rawTranscript);

  // Chunk tuning for AWS Polly natural (~2400 characters)
  const maxBytes = 2400;
  const byteLen = (s) => Buffer.byteLength(s, "utf8");
  const chunks = [];
  let current = "";

  for (const sentence of edited.split(/(?<=[.!?])\s+/)) {
    if ((current + sentence).length > maxBytes) {
      chunks.push(current.trim());
      current = sentence + " ";
    } else current += sentence + " ";
  }
  if (current.trim()) chunks.push(current.trim());

  const id = sessionMeta.sessionId || "episode";
  await putText("transcripts", `${id}.txt`, edited);
  info("transcript.saved", { bucket: "transcripts", key: `${id}.txt` });

  const files = [];
  let totalBytes = 0;
  for (let i = 0; i < chunks.length; i++) {
    const n = String(i + 1).padStart(2, "0");
    const name = `${id}-tts-chunk-${n}.txt`;
    const body = chunks[i];
    const bytes = byteLen(body);
    totalBytes += bytes;
    files.push({ name, bytes });
    await putText("rawtext", name, body);
  }
  info("tts.upload.summary", { bucket: "rawtext", chunks: files.length, totalBytes });

  await putJson("meta", `${id}.json`, {
    session: sessionMeta,
    createdAt: new Date().toISOString(),
    tts: { bucket: "rawtext", count: files.length, maxBytes, files, totalBytes },
  });

  // --- Podcast metadata (ignore intro, include episode number)
  const trimmedForMeta = edited.replace(/^(.{0,2000})/s, "");
  const meta = await generateEpisodeMetaLLM(trimmedForMeta, {
    ...sessionMeta,
    episodeNumber: process.env.PODCAST_RSS_EP || "1"
  });

  await putJson("meta", `${id}-meta.json`, meta);
  info("meta.generated", { title: meta.title, keywords: meta.keywords?.length || 0, key: `${id}-meta.json` });

  return { transcript: edited, chunks: files.map(f => f.name), meta };
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode
};
