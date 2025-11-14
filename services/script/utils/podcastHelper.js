// services/script/utils/podcastHelper.js  
// LLM-driven metadata generation for the podcast: title, description, SEO keywords, and artwork prompt (cached only).

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { putJson } from "../../shared/utils/r2-client.js";
import * as sessionCache from "./sessionCache.js";
import { info, error } from "#logger.js";
import { extractMainContent } from "./textHelpers.js";

/* -----------------------------------------------------------
 * URL + Digit Sanitizer → TTS Friendly Text
 * Best practices for natural-sounding speech synthesis
 * -----------------------------------------------------------
 */
const DIGIT_MAP = {
  0: "zero", 1: "one", 2: "two", 3: "three", 4: "four",
  5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine",
};

function numberToWords(n) {
  return String(n)
    .split("")
    .map(d => DIGIT_MAP[d] ?? d)
    .join(" ");
}

/**
 * Converts URLs to natural speech format
 * Examples:
 *   https://www.openai.com → "openai dot com"
 *   https://github.com/user/repo → "github dot com slash user slash repo"
 *   api.example.com → "A P I dot example dot com"
 */
function urlToSpeech(url) {
  let speech = url
    // Remove protocol
    .replace(/^https?:\/\//i, "")
    // Remove www prefix
    .replace(/^www\./i, "");
  
  // Split into domain and path
  const parts = speech.split("/");
  const domain = parts[0];
  const path = parts.slice(1).filter(Boolean);
  
  // Handle domain
  let domainSpeech = domain
    .split(".")
    .map(part => {
      // Spell out common abbreviations
      if (part.toLowerCase() === "api") return "A P I";
      if (part.toLowerCase() === "www") return "W W W";
      if (part.toLowerCase() === "cdn") return "C D N";
      if (part.toLowerCase() === "app") return "app";
      
      // Keep normal words as-is
      return part;
    })
    .join(" dot ");
  
  // Add path if exists (but keep it simple)
  if (path.length > 0) {
    // Only include first 2 path segments to avoid verbosity
    const simplePath = path.slice(0, 2).join(" slash ");
    domainSpeech += " slash " + simplePath;
    
    if (path.length > 2) {
      domainSpeech += " and more";
    }
  }
  
  return domainSpeech;
}

export function sanitizeForSpeech(text = "") {
  if (!text) return "";
  
  let processed = text;
  
  // First, handle full URLs (must be done before individual character replacements)
  processed = processed.replace(
    /https?:\/\/[^\s]+/gi, 
    (url) => " " + urlToSpeech(url) + " "
  );
  
  // Handle standalone domain-like patterns (e.g., "openai.com" or "api.github.com")
  processed = processed.replace(
    /\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi,
    (domain) => " " + urlToSpeech(domain) + " "
  );
  
  // Replace common symbols with spoken equivalents
  processed = processed
    // Email addresses (handle before dots)
    .replace(/([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/gi, "$1 at $2")
    // Hyphens in text (distinguish from dashes)
    .replace(/\s-\s/g, " to ")  // "5 - 10" → "5 to 10"
    .replace(/-/g, " ")          // hyphenated-words → hyphenated words
    // Numbers (but preserve version numbers like 4.0)
    .replace(/\b(\d+)\.(\d+)\b/g, "$1 point $2")  // "4.0" → "4 point 0"
    .replace(/\b[0-9]+\b/g, (n) => numberToWords(n))
    // Clean up whitespace
    .replace(/\s+/g, " ")
    .trim();
  
  return processed;
}

/* -----------------------------------------------------------
 * Extract JSON safely from an LLM string
 * -----------------------------------------------------------
 */
export function extractAndParseJson(text) {
  if (!text || typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { 
    return JSON.parse(text.slice(start, end + 1)); 
  } catch (err) { 
    error("json.parse.fail", { text: text.slice(start, Math.min(end + 1, start + 100)) });
    return null; 
  }
}

/* -----------------------------------------------------------
 * Prompts
 * -----------------------------------------------------------
 */
export function getTitleDescriptionPrompt(mainOnly) {
  return `You are a creative copywriter for a premium AI news podcast.
Using ONLY the main section of the script (ignore intro and outro), generate:

1. A compact, compelling title (<= 80 characters)
2. A rich, engaging description (<= 300 words)

Return STRICT JSON ONLY (no markdown, no backticks):
{
  "title": "",
  "description": ""
}

MAIN SECTION CONTENT:
${mainOnly}`;
}

export function getSEOKeywordsPrompt(description) {
  return `Generate 10–14 relevant SEO keywords (comma-separated, lower case, no hashtags).
Focus on AI, machine learning, automation, technology, innovation, and news.

Base them ONLY on this description:
${description}

Return ONLY the comma-separated keywords, nothing else.`;
}

export function getArtworkPrompt(description) {
  return `You are a prompt engineer for Google's Nano Banana image model.

Create a vivid artwork prompt (<= 250 chars) based ONLY on the MAIN section description.
MUST FOLLOW:
- NO TEXT of any kind (no letters, no words, no signage)
- Cinematic, abstract, futuristic
- Vibrant, neon, atmospheric
- No human subjects
- No intro/outro themes

Return ONLY the prompt text, no quotes, no preamble.

DESCRIPTION:
${description}`;
}

/* -----------------------------------------------------------
 * Episode Number Calculator
 * Converts date-based sessionId to sequential episode number starting at 1
 * Uses a base date (epoch) to calculate days since, resulting in episode 1, 2, 3...
 * -----------------------------------------------------------
 */
const EPOCH_DATE = new Date("2025-01-01"); // Adjust this to your podcast's start date

function deriveEpisodeNumberFromSessionId(id) {
  if (!id) return null;
  
  // Extract date from sessionId format: "TT-2025-11-14"
  const match = id.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  
  const [_, year, month, day] = match;
  const episodeDate = new Date(`${year}-${month}-${day}`);
  
  // Calculate days since epoch
  const daysSinceEpoch = Math.floor(
    (episodeDate - EPOCH_DATE) / (1000 * 60 * 60 * 24)
  );
  
  // Episode number starts at 1
  return Math.max(1, daysSinceEpoch + 1);
}

/* -----------------------------------------------------------
 * Default keywords fallback
 * -----------------------------------------------------------
 */
const DEFAULT_KEYWORDS = [
  "ai", 
  "artificial intelligence", 
  "machine learning", 
  "podcast", 
  "technology",
  "innovation",
  "automation",
  "tech news",
  "ai news",
  "future tech"
];

/* -----------------------------------------------------------
 * Main metadata builder
 * -----------------------------------------------------------
 */
export async function generateEpisodeMetaLLM(rawTranscript, sessionMeta) {
  const id = sessionMeta?.sessionId || "episode";
  const date = sessionMeta?.date;

  /* 1 — Extract MAIN ONLY + sanitize for speech */
  let mainOnly = "";
  try {
    const extracted = extractMainContent(rawTranscript);
    if (!extracted || extracted.length < 40) {
      throw new Error("Main content too short.");
    }
    mainOnly = sanitizeForSpeech(extracted);
  } catch (err) {
    error("meta.main.extract.fail", { err: String(err), sessionId: id });
    mainOnly = sanitizeForSpeech(rawTranscript);
  }

  /* 2 — Title + Description */
  let title = "AI Weekly";
  let description = "Latest AI developments explained clearly.";
  try {
    const td = await resilientRequest("podcastHelper", {
      sessionId: id,
      section: "meta-title-description",
      messages: [{ role: "user", content: getTitleDescriptionPrompt(mainOnly) }],
    });
    
    const parsed = extractAndParseJson(td);
    if (parsed?.title) title = String(parsed.title).trim().slice(0, 80);
    if (parsed?.description) description = String(parsed.description).trim().slice(0, 1000);
    
    info("meta.titleDesc.success", { sessionId: id, titleLength: title.length });
  } catch (e) {
    error("meta.titleDesc.fail", { err: String(e), sessionId: id });
  }

  /* sanitize description for next LLMs */
  const safeDescription = sanitizeForSpeech(description);

  /* 3 — SEO Keywords */
  let keywords = [];
  try {
    const kw = await resilientRequest("seoKeywords", {
      sessionId: id,
      section: "meta-seo",
      messages: [{ role: "user", content: getSEOKeywordsPrompt(safeDescription) }],
    });

    keywords = String(kw)
      .replace(/\n/g, " ")
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(k => k && k.length > 2);

    // Deduplicate
    keywords = [...new Set(keywords)].slice(0, 14);

    // Pad with defaults if needed
    if (keywords.length < 10) {
      const combined = [...keywords, ...DEFAULT_KEYWORDS];
      keywords = [...new Set(combined)].slice(0, 14);
    }
    
    info("meta.seo.success", { sessionId: id, count: keywords.length });
  } catch (e) {
    error("meta.seo.fail", { err: String(e), sessionId: id });
    keywords = DEFAULT_KEYWORDS.slice(0, 10);
  }

  /* 4 — Artwork Prompt */
  let artworkPrompt = "Cinematic abstract neon depiction of AI systems, swirling data lights, no text";
  try {
    const ap = await resilientRequest("artworkPrompt", {
      sessionId: id,
      section: "meta-artwork",
      messages: [{ role: "user", content: getArtworkPrompt(safeDescription) }],
    });

    let prompt = String(ap).trim().replace(/^["'`]+|["'`]+$/g, "");
    
    // Remove any remaining text characters (this line seems wrong - it removes ALL alphanumeric!)
    // prompt = prompt.replace(/[A-Za-z0-9]/g, "").trim();
    // Instead, just validate length and keep the prompt as-is
    
    if (prompt && prompt.length > 10 && prompt.length <= 250) {
      artworkPrompt = prompt;
    }

    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", artworkPrompt);
    info("artwork.cached", { sessionId: id, promptLength: artworkPrompt.length });
  } catch (e) {
    error("meta.artwork.fail", { err: String(e), sessionId: id });
    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", artworkPrompt);
    info("artwork.cached.fallback", { sessionId: id });
  }

  /* 5 — Episode Number (starts at 1) */
  const episodeNumber = 
    String(process.env.PODCAST_RSS_EP || "").toLowerCase() === "yes"
      ? deriveEpisodeNumberFromSessionId(id)
      : null;

  /* Final JSON */
  const meta = {
    session: { sessionId: id, date },
    title,
    description,
    keywords,
    episodeNumber,
    createdAt: new Date().toISOString(),
  };

  info("meta.generation.complete", { 
    sessionId: id, 
    episodeNumber, 
    keywordCount: keywords.length 
  });

  return meta;
}

export default {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
  generateEpisodeMetaLLM,
  sanitizeForSpeech,
  extractMainContent,
};
