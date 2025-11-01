// ============================================================
// 🎧 services/script/utils/models.js — Clean Transcript Generator
// ============================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
} from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { putText, putJson } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import chunkText from "./chunkText.js";
import { generateEpisodeMeta,extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt } from "./podcastHelpers.js";
import { getAllParts } from "./sessionCache.js";
import { getWeatherSummary } from "./getWeatherSummary.js";
import { getTuringQuote } from "./getTuringQuote.js";

function normalizeSessionId(sessionId) {
  return typeof sessionId === "object" && sessionId
    ? sessionId.id || sessionId.sessionId || String(sessionId)
    : String(sessionId);
}

// Clean any model output to guaranteed plain text
function sanitizeOutput(text = "") {
  return text
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/[*_~`#<>]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .trim();
}

// 🧩 Intro
export async function generateIntro(sessionId, targetMins = 45) {
  const weatherSummary = await getWeatherSummary();
  const turingQuote = await getTuringQuote();
  const prompt = getIntroPrompt({ weatherSummary, turingQuote, targetMins });

  const systemPrompt = `
${prompt}

CRITICAL INSTRUCTIONS:
- Output plain text only — no cues, brackets, or meta.
- Maintain smooth weather → quote → tone progression.
  `.trim();

  const res = await resilientRequest("scriptIntro", {
    sessionId,
    section: "intro",
    messages: [{ role: "system", content: systemPrompt }],
  });

  return sanitizeOutput(res);
}

// 🧩 Main
export async function generateMain(sessionId, targetMins = 45) {
  const feedUrl = process.env.FEED_URL;
  if (!feedUrl) throw new Error("Missing FEED_URL env variable");

  const articles = await fetchFeedArticles(feedUrl);
  if (!articles?.length) throw new Error("No articles fetched");

  const prompt = getMainPrompt({ articles, targetDuration: targetMins });
  const systemPrompt = `
${prompt}

OUTPUT REQUIREMENTS:
- Produce continuous, plain-text narrative only.
- Avoid meta, headings, or structural formatting.
  `.trim();

  const res = await resilientRequest("scriptMain", {
    sessionId,
    section: "main",
    messages: [{ role: "system", content: systemPrompt }],
  });

  return sanitizeOutput(res);
}

// 🧩 Outro
export async function generateOutro(sessionId, targetMins = 45) {
  const prompt = await getOutroPromptFull(targetMins);
  const systemPrompt = `
${prompt}

OUTPUT RULES:
- Plain text only.
- Natural closing tone.
- No sound cues or parentheticals.
  `.trim();

  const res = await resilientRequest("scriptOutro", {
    sessionId,
    section: "outro",
    messages: [{ role: "system", content: systemPrompt }],
  });

  return sanitizeOutput(res);
}

// 🧩 Combine + Upload
export async function finalizeAndUpload(sessionId) {
  const { intro, main, outro } = await getAllParts(sessionId);
  if (!intro || !main || !outro)
    throw new Error("Missing one or more transcript parts");

  const fullTranscript = cleanTranscript(`${intro}\n\n${main}\n\n${outro}`);
  const cleaned = sanitizeOutput(fullTranscript);

  const chunks = chunkText(cleaned);
  const id = normalizeSessionId(sessionId);

  await putText("transcript", `${id}.txt`, cleaned);
  await Promise.all(
    chunks.map((chunk, i) =>
      putText("rawText", `${id}/chunk_${i + 1}.txt`, chunk)
    )
  );

  const metadata = await generateEpisodeMeta({ intro, main, outro });
  await putJson("meta", `${id}.json`, metadata);

  return { fullTranscript: cleaned, chunks, metadata };
}

// 🧩 Orchestrator
export async function generateComposedEpisode(sessionId, targetMins = 45) {
  console.log(`🎙️ Starting ${targetMins}-minute episode for session ${sessionId}`);

  const [intro, main, outro] = await Promise.all([
    generateIntro(sessionId, targetMins),
    generateMain(sessionId, targetMins),
    generateOutro(sessionId, targetMins),
  ]);

  console.log("🧩 All sections generated — finalizing upload...");
  return await finalizeAndUpload(sessionId);
    }
