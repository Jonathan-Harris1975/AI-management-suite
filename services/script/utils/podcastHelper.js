// services/script/utils/podcastHelper.js  
// LLM-driven metadata generation for the podcast: title, description, SEO keywords, and artwork prompt (cached only).

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { putJson } from "../../shared/utils/r2-client.js"; // kept for future use if needed
import * as sessionCache from "./sessionCache.js";
import { info, error ,debug} from "#logger.js";
import { extractMainContent } from "./textHelpers.js";

/* -----------------------------------------------------------
 * URL + Digit Sanitizer → TTS Friendly Text
 * Best practices for natural-sounding speech synthesis
 * -----------------------------------------------------------
 */
const DIGIT_MAP = {
  0: "zero",
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
};

function numberToWords(n) {
  return String(n)
    .split("")
    .map((d) => DIGIT_MAP[d] ?? d)
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
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "api") return "A P I";
      if (lower === "www") return "W W W";
      if (lower === "cdn") return "C D N";
      if (lower === "app") return "app";
      // Keep normal words as-is
      return part;
    })
    .join(" dot ");

  // Add path if exists (but keep it simple)
  if (path.length > 0) {
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

  // 1) Handle full URLs
  processed = processed.replace(/https?:\/\/[^\s]+/gi, (url) => {
    return " " + urlToSpeech(url) + " ";
  });

  // 2) Handle standalone domain-like patterns
  processed = processed.replace(
    /\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi,
    (domain) => " " + urlToSpeech(domain) + " "
  );

  // 3) Replace common symbols with spoken equivalents
  processed = processed
    // Email addresses (handle before dots)
    .replace(
      /([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/gi,
      "$1 at $2"
    )
    // Hyphens in text (distinguish from dashes)
    .replace(/\s-\s/g, " to ") // "5 - 10" → "5 to 10"
    .replace(/-/g, " ") // hyphenated-words → hyphenated words
    // Numbers (but preserve version numbers like 4.0)
    .replace(/\b(\d+)\.(\d+)\b/g, "$1 point $2") // "4.0" → "4 point 0"
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

  // Strip common markdown fences just in case
  const cleaned = text
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) return null;

  try {
    const slice = cleaned.slice(start, end + 1);
    return JSON.parse(slice);
  } catch (err) {
    error("json.parse.fail", {
      preview: cleaned.slice(start, Math.min(end + 1, start + 160)),
      err: String(err),
    });
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
  if (!id || typeof id !== "string") return null;

  // Extract date from sessionId format: "TT-2025-11-14"
  const match = id.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  const episodeDate = new Date(`${year}-${month}-${day}`);
  if (Number.isNaN(episodeDate.getTime())) return null;

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
  "future tech",
];

/* -----------------------------------------------------------
 * Keyword normalization
 * -----------------------------------------------------------
 */
function normalizeKeywords(input, maxCount = 14) {
  if (!input) return [];

  let raw;
  if (Array.isArray(input)) {
    raw = input.join(",");
  } else {
    raw = String(input);
  }

  let keywords = raw
    .replace(/\s*\n+\s*/g, " ")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((k) => k && k.length > 2);

  // Deduplicate
  keywords = [...new Set(keywords)];

  // Pad with defaults if needed
  if (keywords.length < 10) {
    const combined = [...keywords, ...DEFAULT_KEYWORDS];
    keywords = [...new Set(combined)];
  }

  return keywords.slice(0, maxCount);
}

/* -----------------------------------------------------------
 * Main metadata builder
 * -----------------------------------------------------------
 */
export async function generateEpisodeMetaLLM(rawTranscript, sessionMeta = {}) {
  const id = sessionMeta?.sessionId || sessionMeta?.id || "episode";
  const date = sessionMeta?.date || new Date().toISOString();

  // Track operation status for summary
  const opStatus = {
    mainExtract: { success: false, fallback: false },
    titleDesc: { success: false, fallback: false, titleLength: 0, descLength: 0 },
    keywords: { success: false, fallback: false, count: 0 },
    artwork: { success: false, fallback: false, cached: false, promptLength: 0 },
    episodeNumber: { value: 1, source: "default" }
  };

  /* 1 — Extract MAIN ONLY + sanitize for speech */
  let mainOnly = "";
  try {
    const extracted = extractMainContent(rawTranscript);
    if (!extracted || extracted.length < 40) {
      throw new Error("Main content too short.");
    }
    mainOnly = sanitizeForSpeech(extracted);
    opStatus.mainExtract.success = true;
  } catch (err) {
    error("meta.main.extract.fail", { err: String(err), sessionId: id });
    mainOnly = sanitizeForSpeech(rawTranscript || "");
    opStatus.mainExtract.fallback = true;
  }

  /* 2 — Title + Description */
  let title = "AI Weekly";
  let description = "Latest AI developments explained clearly.";

  try {
    const td = await resilientRequest("podcastHelper", {
      sessionId: id,
      section: "meta-title-description",
      messages: [
        {
          role: "user",
          content: getTitleDescriptionPrompt(mainOnly),
        },
      ],
    });

    const parsed = extractAndParseJson(td);

    if (parsed?.title) {
      title = String(parsed.title).trim();
    }
    if (parsed?.description) {
      description = String(parsed.description).trim();
    }

    // Hard caps (safety)
    title = title.slice(0, 160);
    description = description.slice(0, 4000);

    opStatus.titleDesc.success = true;
    opStatus.titleDesc.titleLength = title.length;
    opStatus.titleDesc.descLength = description.length;
  } catch (e) {
    error("meta.titleDesc.fail", { err: String(e), sessionId: id });
    opStatus.titleDesc.fallback = true;
  }

  // Additional hardening: ensure non-empty title/description
  if (!title || !title.trim()) {
    title = `AI News — ${date.slice(0, 10)}`;
    opStatus.titleDesc.fallback = true;
  }
  if (!description || !description.trim()) {
    description = "A deep dive into the latest AI and technology news.";
    opStatus.titleDesc.fallback = true;
  }

  opStatus.titleDesc.titleLength = title.length;
  opStatus.titleDesc.descLength = description.length;

  /* Sanitize description for next LLMs */
  const safeDescription = sanitizeForSpeech(description);

  /* 3 — SEO Keywords */
  let keywords = [];

  try {
    const kw = await resilientRequest("seoKeywords", {
      sessionId: id,
      section: "meta-seo",
      messages: [
        {
          role: "user",
          content: getSEOKeywordsPrompt(safeDescription),
        },
      ],
    });

    keywords = normalizeKeywords(kw, 14);
    opStatus.keywords.success = true;
    opStatus.keywords.count = keywords.length;
  } catch (e) {
    error("meta.seo.fail", { err: String(e), sessionId: id });
    keywords = DEFAULT_KEYWORDS.slice(0, 10);
    opStatus.keywords.fallback = true;
    opStatus.keywords.count = keywords.length;
  }

  /* 4 — Artwork Prompt */
  let artworkPrompt =
    "Cinematic abstract neon depiction of AI systems, swirling data lights, no text";

  try {
    const ap = await resilientRequest("artworkPrompt", {
      sessionId: id,
      section: "meta-artwork",
      messages: [
        {
          role: "user",
          content: getArtworkPrompt(safeDescription),
        },
      ],
    });

    let prompt = String(ap).trim().replace(/^["'`]+|["'`]+$/g, "");

    // Length validation only — do NOT strip all alphanumerics
    if (prompt && prompt.length > 10 && prompt.length <= 250) {
      artworkPrompt = prompt;
      opStatus.artwork.success = true;
    } else {
      opStatus.artwork.fallback = true;
    }

    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", artworkPrompt);
    opStatus.artwork.cached = true;
    opStatus.artwork.promptLength = artworkPrompt.length;
  } catch (e) {
    error("meta.artwork.fail", { err: String(e), sessionId: id });
    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", artworkPrompt);
    opStatus.artwork.fallback = true;
    opStatus.artwork.cached = true;
    opStatus.artwork.promptLength = artworkPrompt.length;
  }

  /* 5 — Episode Number (always >= 1, never null) */
  let episodeNumber;

  try {
    // If upstream explicitly provided an episode number, trust it (but clamp to >=1)
    if (sessionMeta?.episodeNumber != null) {
      const explicit = Number(sessionMeta.episodeNumber);
      episodeNumber = Number.isFinite(explicit) ? Math.max(1, explicit) : 1;
      opStatus.episodeNumber.source = "explicit";
    } else {
      const useEpisodeNumbers =
        String(process.env.PODCAST_RSS_EP || "").toLowerCase() === "yes";

      if (useEpisodeNumbers) {
        const derived = deriveEpisodeNumberFromSessionId(id);
        episodeNumber = Number.isFinite(derived) ? derived : 1;
        opStatus.episodeNumber.source = derived ? "derived" : "default";
      } else {
        // Even when RSS numbering is disabled, keep a stable, valid field
        episodeNumber = 1;
        opStatus.episodeNumber.source = "disabled";
      }
    }
  } catch (err) {
    error("meta.episodeNumber.fail", { sessionId: id, err: String(err) });
    episodeNumber = 1;
    opStatus.episodeNumber.source = "error_fallback";
  }

  // Final clamping safety
  if (!Number.isFinite(episodeNumber) || episodeNumber < 1) {
    episodeNumber = 1;
    opStatus.episodeNumber.source = "clamped";
  }

  opStatus.episodeNumber.value = episodeNumber;

  /* Final JSON — always includes sessionId + episodeNumber >= 1 */
  const meta = {
    session: {
      sessionId: id,
      date,
    },
    title,
    description,
    keywords,
    artworkPrompt,
    episodeNumber,
    createdAt: new Date().toISOString(),
  };

  // Single comprehensive summary log
  info("🔗 meta.generation.complete")
  debug("🔗 meta.generation.complete", {
    sessionId: id,
    episodeNumber,
    mainExtract: opStatus.mainExtract.success ? "success" : "fallback",
    titleDesc: {
      status: opStatus.titleDesc.success ? "success" : "fallback",
      titleChars: opStatus.titleDesc.titleLength,
      descChars: opStatus.titleDesc.descLength
    },
    keywords: {
      status: opStatus.keywords.success ? "success" : "fallback",
      count: opStatus.keywords.count
    },
    artwork: {
      status: opStatus.artwork.success ? "success" : "fallback",
      cached: opStatus.artwork.cached,
      promptChars: opStatus.artwork.promptLength
    },
    episodeNumberSource: opStatus.episodeNumber.source
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
