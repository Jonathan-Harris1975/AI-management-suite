// services/script/utils/podcastHelper.js
// LLM-driven metadata generation for the podcast: title, description, SEO keywords, and artwork prompt (cached only).

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { putJson } from "../../shared/utils/r2-client.js";
import * as sessionCache from "./sessionCache.js";
import { info, error } from "#logger.js";
import { extractMainContent } from "./textHelpers.js";

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
 * MAIN SECTION ONLY — intro & outro ignored.
 */
export function getTitleDescriptionPrompt(mainOnly) {
  return `You are a creative copywriter for a premium AI news podcast.
Using ONLY the main section of the script (ignore intro and outro), generate:

1. A compact, compelling title (<= 80 characters)
2. A rich, engaging description (<= 300 words)

Return STRICT JSON ONLY:
{
  "title": "",
  "description": ""
}

MAIN SECTION CONTENT:
${mainOnly}`;
}

/**
 * SEO keywords prompt
 */
export function getSEOKeywordsPrompt(description) {
  return `Generate 10–14 relevant SEO keywords (comma-separated, lower case, no hashtags).
Focus on AI, machine learning, automation, technology, innovation, and news.

Base them ONLY on this description:
${description}`;
}

/**
 * Artwork prompt (Nano Banana)
 * Reinforce: **NO TEXT ALLOWED**
 */
export function getArtworkPrompt(description) {
  return `
You are a prompt engineer for Google's Nano Banana image model.

Create a vivid artwork prompt (<= 250 chars) based ONLY on the MAIN section description.
MUST FOLLOW:
- NO TEXT of any kind (no letters, no words, no signage)
- Cinematic, abstract, futuristic
- Vibrant, neon, atmospheric
- No human subjects
- No intro/outro themes

DESCRIPTION:
${description}`;
}

/**
 * Main entrypoint — build metadata via LLM and save to meta bucket.
 * Artwork prompt is cached to memory only (NOT saved to R2).
 */
export async function generateEpisodeMetaLLM(rawTranscript, sessionMeta) {
  const id = sessionMeta?.sessionId || "episode";
  const date = sessionMeta?.date;

  // ────────────────────────────────────────────
  // 1) Extract MAIN SECTION ONLY
  // ────────────────────────────────────────────
  let mainOnly = "";
  try {
    mainOnly = extractMainContent(rawTranscript);
    if (!mainOnly || mainOnly.length < 40) {
      throw new Error("Main content extraction failed or too short.");
    }
  } catch (err) {
    error("meta.main.extract.fail", { err: String(err) });
    // fallback to rawTranscript (worst case scenario)
    mainOnly = rawTranscript;
  }

  // ────────────────────────────────────────────
  // 2) Title + Description (based on MAIN ONLY)
  // ────────────────────────────────────────────
  let title = "AI Weekly";
  let description = "Latest AI developments explained clearly.";
  try {
    const td = await resilientRequest("podcastHelper", {
      sessionId: sessionMeta,
      section: "meta-title-description",
      messages: [{ role: "system", content: getTitleDescriptionPrompt(mainOnly) }],
    });
    const parsed = extractAndParseJson(td);
    if (parsed?.title) title = String(parsed.title).trim();
    if (parsed?.description) description = String(parsed.description).trim();
  } catch (e) {
    error("meta.titleDesc.fail", { err: String(e) });
  }

  // ────────────────────────────────────────────
  // 3) SEO Keywords
  // ────────────────────────────────────────────
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

    const seen = new Set();
    keywords = keywords.filter(k => !seen.has(k) && seen.add(k)).slice(0, 14);

    if (keywords.length < 10) {
      const add = ["ai", "artificial intelligence", "machine learning", "podcast", "technology"];
      for (const k of add) {
        if (!seen.has(k)) {
          keywords.push(k);
          seen.add(k);
          if (keywords.length >= 10) break;
        }
      }
    }
  } catch (e) {
    error("meta.seo.fail", { err: String(e) });
  }

  // ────────────────────────────────────────────
  // 4) Artwork Prompt — with NO TEXT rule
  // ────────────────────────────────────────────
  try {
    const ap = await resilientRequest("artworkPrompt", {
      sessionId: sessionMeta,
      section: "meta-artwork",
      messages: [{ role: "system", content: getArtworkPrompt(description) }],
    });

    let prompt = String(ap).trim().replace(/^"+|"+$/g, "");

    // Safety guard: strip accidental textual elements the model might output
    prompt = prompt.replace(/[A-Za-z0-9]/g, "").trim();

    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", prompt);
    info("artwork.cached", { sessionId: id, prompt });
  } catch (e) {
    const fallback = "Cinematic abstract neon depiction of AI systems, swirling data lights, no text";
    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", fallback);
    info("artwork.cached.fallback", { sessionId: id, prompt: fallback });
  }

  // ────────────────────────────────────────────
  // 5) Build Final JSON — include episodeNumber ONLY if enabled
  // ────────────────────────────────────────────
  const episodeNumber =
    String(process.env.PODCAST_RSS_EP || "").toLowerCase() === "yes"
      ? sessionMeta?.episodeNumber || null
      : null;

  const meta = {
    session: { sessionId: id, date },
    title,
    description,
    keywords,
    episodeNumber,   // <────────────── added ✔
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
