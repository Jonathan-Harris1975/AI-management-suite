// services/script/utils/models.js
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
import { generateEpisodeMeta } from "./podcastHelpers.js";
import { getAllParts } from "./sessionCache.js";

// ─────────────────────────────────────────────────────────────
// 🧩 Intro Section
// ─────────────────────────────────────────────────────────────
export async function generateIntro(sessionId) {
  const weatherSummary =
    "Overcast and drizzly — perfect AI podcast weather.";
  const turingQuote =
    "We can only see a short distance ahead, but we can see plenty there that needs to be done.";
  const prompt = getIntroPrompt({ weatherSummary, turingQuote });

  return await resilientRequest("scriptIntro", {
    sessionId,
    section: "intro",
    messages: [{ role: "system", content: prompt }],
  });
}

// ─────────────────────────────────────────────────────────────
// 🧩 Main Section
// ─────────────────────────────────────────────────────────────
export async function generateMain(sessionId) {
  const articles = await fetchFeedArticles(process.env.FEED_URL || "");
  const prompt = getMainPrompt({ articles, targetDuration: 60 });

  return await resilientRequest("scriptMain", {
    sessionId,
    section: "main",
    messages: [{ role: "system", content: prompt }],
  });
}

// ─────────────────────────────────────────────────────────────
// 🧩 Outro Section
// ─────────────────────────────────────────────────────────────
export async function generateOutro(sessionId) {
  const prompt = getOutroPromptFull();
  return await resilientRequest("scriptOutro", {
    sessionId,
    section: "outro",
    messages: [{ role: "system", content: prompt }],
  });
}

// ─────────────────────────────────────────────────────────────
// 🧩 Combine + Upload Transcript / Metadata
// ─────────────────────────────────────────────────────────────
export async function finalizeAndUpload(sessionId) {
  const { intro, main, outro } = await getAllParts(sessionId);

  // ✅ Normalize sessionId to string
  if (typeof sessionId === "object") {
    sessionId = sessionId.id || sessionId.sessionId || String(sessionId);
  }

  const fullTranscript = cleanTranscript(`${intro}\n\n${main}\n\n${outro}`);
  const chunks = chunkText(fullTranscript);

  // ✅ Upload transcript and chunks to proper R2 buckets
  await putText("transcript", `${sessionId}.txt`, fullTranscript);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await putText("raw-text", `${sessionId}/chunk_${i + 1}.txt`, chunk);
  }

  const metadata = await generateEpisodeMeta({ intro, main, outro });
  await putJson("meta", `${sessionId}.json`, metadata);

  return { fullTranscript, chunks, metadata };
}

// ─────────────────────────────────────────────────────────────
// 🧩 Unified entry point for orchestrator
// ─────────────────────────────────────────────────────────────
export async function generateComposedEpisode(sessionId) {
  const intro = await generateIntro(sessionId);
  const main = await generateMain(sessionId);
  const outro = await generateOutro(sessionId);

  // store or finalize all
  return await finalizeAndUpload(sessionId);
}
