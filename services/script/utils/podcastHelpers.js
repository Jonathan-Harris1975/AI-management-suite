// ============================================================
// 🎧 services/script/utils/podcastHelper.js — Gen X Editorial Edition
// ============================================================
//
// Generates podcast metadata (title, description, SEO keywords, artwork prompt)
// using resilientRequest() + aiConfig routing. Outputs go to the meta bucket.
// Tone: calm, wry, first-person Jonathan Harris style.
//
// ============================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { info, error } from "#logger.js";
import { r2Put } from "../../shared/utils/r2-client.js";
import aiConfig from "../../shared/utils/ai-config.js";
import * as sessionCache from "./sessionCache.js";

// ============================================================
// 🧩 Safe JSON extractor
// ============================================================
export function extractAndParseJson(text) {
  if (!text || typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(text.substring(start, end + 1));
  } catch {
    return null;
  }
}

// ============================================================
// 🧠 Prompt Builders
// ============================================================

// --- 1️⃣ Title + Description — refined Gen X tone ---
export function getTitleDescriptionPrompt(transcript) {
  return `You are Jonathan Harris, host of "Turing’s Torch: AI Weekly" — an AI news podcast known for sharp insight, dry British wit, and clear-eyed commentary.

Write both a title and description in a confident first-person editorial voice.
The description should feel conversational and grounded — thoughtful, engaging, and forward-looking.
Sound like an analyst who’s lived through the tech hype cycles and now speaks with calm clarity.

Guidelines:
- No phrases like “In this episode” or “Jonathan Harris discusses.”
- Speak *as Jonathan Harris*, addressing the listener directly.
- Keep it between 160 and 260 words.
- Title ≤ 80 characters, concise and punchy.
- The description should read naturally, similar in rhythm and tone to:

“Join Jonathan Harris on this week’s Turing’s Torch as we delve into the critical intersections of AI, climate change, and urban development. From groundbreaking renewable-energy advancements to the importance of green spaces for mental health, we explore how technology is reshaping our world. Discover sustainable practices, the challenges facing global agriculture, and the need for robust cybersecurity in our digitised lives. Plus, a look at community-driven initiatives fostering resilience and engagement. Tune in for clarity amid the noise of AI headlines and ignite your understanding of the future.”

Return **only valid JSON**:
{
  "title": "Short, sharp title",
  "description": "First-person narrative description."
}

Transcript:
${transcript}`;
}

// --- 2️⃣ SEO Keywords ---
export function getSEOKeywordsPrompt(description) {
  return `Generate 8–14 relevant SEO keywords (comma-separated) for this description:
${description}`;
}

// --- 3️⃣ Artwork Prompt (Nano Banana Optimised) ---
export function getArtworkPrompt(description) {
  return `Create an abstract, cinematic image prompt for Google ImageFX / Gemini Nano Banana.
Avoid people, logos, or text. Focus on light, motion, and atmosphere that visually echo this description:
${description}`;
}

// ============================================================
// 🚀 Meta Orchestrator
// ============================================================
export async function generateEpisodeMetaLLM({ intro, main, outro, sessionId }) {
  const transcript = `${intro}\n\n${main}\n\n${outro}`;

  try {
    info("podcastHelper.meta.start", { sessionId });

    // --- Step 1: Title + Description ---
    const tdPrompt = getTitleDescriptionPrompt(transcript);
    const tdResponse = await resilientRequest("podcastHelper", tdPrompt, {
      temperature: 0.8,
    });
    const tdJson = extractAndParseJson(tdResponse?.content || tdResponse);
    const title = tdJson?.title || "Untitled Episode";
    const description = tdJson?.description || "No description available.";

    // --- Step 2: SEO Keywords ---
    const seoPrompt = getSEOKeywordsPrompt(description);
    const seoResponse = await resilientRequest("seoKeywords", seoPrompt);
    const keywords =
      seoResponse?.content?.split(",").map((x) => x.trim()) ||
      (seoResponse ? [seoResponse.content] : []);

    // --- Step 3: Artwork Prompt ---
    const artworkPrompt = getArtworkPrompt(description);
    await sessionCache.storeTempPart(sessionId, "artworkPrompt", artworkPrompt);

    // --- Step 4: Save Metadata ---
    const metaPayload = {
      session: { sessionId, date: new Date().toISOString().split("T")[0] },
      title,
      description,
      keywords,
      createdAt: new Date().toISOString(),
    };

    const metaKey = `meta-${sessionId}.json`;
    await r2Put("meta", metaKey, JSON.stringify(metaPayload, null, 2));

    // --- Logging Summary ---
    console.log("🪶 Meta tone: Gen X editorial (temp 0.8)");
    console.log("🧠 Episode Metadata Generated:");
    console.table({
      title,
      description: `${description.slice(0, 90)}...`,
      keywords: keywords.length,
      sessionId,
    });

    info("podcastHelper.meta.complete", { title, keywordCount: keywords.length, sessionId });
    return metaPayload;
  } catch (err) {
    error("podcastHelper.meta.fail", { message: err.message });
    return null;
  }
}

// ============================================================
// 📤 Exports
// ============================================================
export default {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
  generateEpisodeMetaLLM,
};
