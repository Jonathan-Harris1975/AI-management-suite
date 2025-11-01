// ============================================================
// 🎧 services/script/utils/podcastHelper.js  —  Gen-X Edition
// ============================================================
//
// Generates episode metadata (title, description, SEO keywords, artwork prompt)
// using LLM routes defined in ai-config.  Outputs are stored to R2 meta bucket.
//
// Features:
//  - ResilientRequest integration for fault tolerance
//  - First-person Gen X editorial voice for descriptions
//  - Nano-Banana artwork prompt logic
//  - Console summary for transparency
// ============================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { info, error } from "#logger.js";
import { r2Put } from "../../shared/utils/r2-client.js";
import aiConfig from "../../shared/utils/ai-config.js";
import * as sessionCache from "./sessionCache.js";

// ============================================================
// 🧩 Utility: extract JSON safely
// ============================================================
export function extractAndParseJson(text) {
  if (!text || typeof text !== "string") return null;
  const startIndex = text.indexOf("{");
  const endIndex = text.lastIndexOf("}");
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return null;
  try {
    return JSON.parse(text.substring(startIndex, endIndex + 1));
  } catch {
    return null;
  }
}

// ============================================================
// 🧠 Prompt Builders
// ============================================================

// --- 1️⃣ Title + Description ---
export function getTitleDescriptionPrompt(transcript) {
  return `You are writing the official episode title and description for "Turing's Torch: AI Weekly" — a sharp, wry-minded podcast hosted by Jonathan Harris.

Write in a calm, Gen X-style first-person editorial voice — thoughtful, dryly humorous, and sceptical of hype.
Sound like a seasoned analyst speaking directly to the listener.
Avoid phrases like "In this episode" or "Jonathan Harris discusses". Speak as the show's own voice.

Produce:
1️⃣ A concise, witty title (≤ 80 characters)
2️⃣ A natural first-person description (≤ 250 words) that blends clarity with subtle personality.
Keep it engaging, intelligent, and authentic.

Return valid JSON only:
{
  "title": "Punchy title",
  "description": "Human, first-person summary with insight and tone."
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
  return `Create an abstract, cinematic prompt for Google ImageFX / Gemini Nano Banana.
Keep it atmospheric and modern — no people, no logos, no text.
Focus on light, geometry, and motion that visually echoes this description:
${description}`;
}

// ============================================================
// 🚀 High-level Meta Orchestrator
// ============================================================
export async function generateEpisodeMetaLLM({ intro, main, outro, sessionId }) {
  const transcript = `${intro}\n\n${main}\n\n${outro}`;

  try {
    info("podcastHelper.meta.start", { service: "ai-podcast-suite", sessionId });

    // --- Step 1: Title + Description ---
    const tdPrompt = getTitleDescriptionPrompt(transcript);
    const tdResponse = await resilientRequest("podcastHelper", tdPrompt, {
      temperature: 0.8, // 👈 warmer tone for creativity
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

    // --- Step 4: Build & Upload Metadata ---
    const metaPayload = {
      session: { sessionId, date: new Date().toISOString().split("T")[0] },
      title,
      description,
      keywords,
      createdAt: new Date().toISOString(),
    };

    const metaKey = `meta-${sessionId}.json`;
    await r2Put("meta", metaKey, JSON.stringify(metaPayload, null, 2));

    // --- Console Summary ---
    console.log("🪶 Meta tone: Gen X editorial (temp 0.8)");
    console.log("🧠 Episode Metadata Generated:");
    console.table({
      title,
      description: `${description.slice(0, 80)}...`,
      keywords: keywords.length,
      sessionId,
    });

    info("podcastHelper.meta.complete", {
      service: "ai-podcast-suite",
      title,
      keywordCount: keywords.length,
      sessionId,
    });

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
