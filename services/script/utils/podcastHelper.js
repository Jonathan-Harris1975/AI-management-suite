// services/script/utils/podcastHelper.js
// LLM-driven metadata generation for the podcast: title, description, SEO keywords, and artwork prompt (cached only).

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { putJson } from "../../shared/utils/r2-client.js";
import * as sessionCache from "./sessionCache.js";
import { info, error } from "#logger.js";

/**
 * Safely extract a JSON object from LLM text (handles code fences and extra prose)
 */
export function extractAndParseJson(text) {
  if (!text || typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

/**
 * Title + Description prompt
 */
export function getTitleDescriptionPrompt(transcript) {
  return `You are a creative copywriter for an AI news podcast.
Based on the transcript, generate a short title (<= 80 chars) and an engaging description (<= 300 words).
Return **ONLY** compact JSON — no commentary, no markdown:
{
  "title": "Concise, compelling title",
  "description": "Human-like, engaging summary of the episode."
}

Transcript:
${transcript}`;
}

/**
 * SEO keywords prompt
 */
export function getSEOKeywordsPrompt(description) {
  return `Generate 10–14 relevant SEO keywords for this podcast episode (comma-separated, lower case, no hashtags).
Focus on podcast, AI, technology, innovation, automation, current trends.
Description:
${description}`;
}

/**
 * Artwork prompt (Nano Banana optimized)
 */
export function getArtworkPrompt(description) {
  return `You are a visual prompt engineer for Google's Nano Banana image model.
Create a concise, vivid prompt (<= 250 chars) capturing the tone and theme.
Make it cinematic, abstract, futuristic, vibrant. Avoid human subjects.
Base it on this episode description:
${description}`;
}

/**
 * Main entrypoint — build metadata via LLM and save to meta bucket.
 * Artwork prompt is cached to memory only (NOT saved to R2).
 */
export async function generateEpisodeMetaLLM(transcript, sessionMeta) {
  const id = sessionMeta?.sessionId || "episode";
  const date = sessionMeta?.date;

  // 1) Title + Description
  let title = "AI Weekly";
  let description = "Latest AI developments explained clearly.";
  try {
    const td = await resilientRequest("podcastHelper", {
      sessionId: sessionMeta,
      section: "meta-title-description",
      messages: [{ role: "system", content: getTitleDescriptionPrompt(transcript) }],
    });
    const parsed = extractAndParseJson(td);
    if (parsed?.title) title = String(parsed.title).trim();
    if (parsed?.description) description = String(parsed.description).trim();
  } catch (e) {
    error("meta.titleDesc.fail", { err: String(e) });
  }

  // 2) SEO Keywords
  let keywords = [];
  try {
    const kw = await resilientRequest("seoKeywords", {
      sessionId: sessionMeta,
      section: "meta-seo",
      messages: [{ role: "system", content: getSEOKeywordsPrompt(description) }],
    });
    keywords = String(kw)
      .replace(/\n/g, " ")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    // normalize 10–14 unique
    const seen = new Set();
    keywords = keywords.filter(k => !seen.has(k) && seen.add(k)).slice(0, 14);
    if (keywords.length < 10) {
      // simple augmentation if too short
      const add = ["ai", "artificial intelligence", "machine learning", "podcast", "technology"];
      for (const k of add) if (!seen.has(k)) { keywords.push(k); seen.add(k); if (keywords.length >= 10) break; }
    }
  } catch (e) {
    error("meta.seo.fail", { err: String(e) });
  }

  // 3) Artwork Prompt (cache only)
  try {
    const ap = await resilientRequest("artworkPrompt", {
      sessionId: sessionMeta,
      section: "meta-artwork",
      messages: [{ role: "system", content: getArtworkPrompt(description) }],
    });
    const prompt = String(ap).trim().replace(/^"+|"+$/g, "");
    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", prompt);
    info("artwork.cached", { sessionId: id, prompt });
  } catch (e) {
    const fallback = "Cinematic abstract visualization of AI innovation in vibrant neon hues";
    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", fallback);
    info("artwork.cached.fallback", { sessionId: id, prompt: fallback });
  }

  const meta = {
    session: { sessionId: id, date },
    title,
    description,
    keywords,
    createdAt: new Date().toISOString(),
  };

  return meta;
}

export default {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
  generateEpisodeMetaLLM,
};
