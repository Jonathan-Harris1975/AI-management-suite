// services/script/utils/podcastHelper.js
// LLM-driven metadata generation for the podcast: title, description,
// SEO keywords, and artwork prompt (cached only).

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { putJson } from "../../shared/utils/r2-client.js";
import * as sessionCache from "./sessionCache.js";
import { info, error, debug } from "#logger.js";
import { extractMainContent } from "./textHelpers.js";

/* -----------------------------------------------------------
 * URL + Digit Sanitizer → TTS Friendly
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

function urlToSpeech(url) {
  let speech = url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "");

  const parts = speech.split("/");
  const domain = parts[0];
  const path = parts.slice(1).filter(Boolean);

  let domainSpeech = domain
    .split(".")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "api") return "A P I";
      if (lower === "cdn") return "C D N";
      if (lower === "www") return "W W W";
      return part;
    })
    .join(" dot ");

  if (path.length > 0) {
    const simplePath = path.slice(0, 2).join(" slash ");
    domainSpeech += " slash " + simplePath;

    if (path.length > 2) domainSpeech += " and more";
  }

  return domainSpeech;
}

export function sanitizeForSpeech(text = "") {
  if (!text) return "";

  let processed = text;

  processed = processed.replace(/https?:\/\/[^\s]+/gi, (url) => {
    return " " + urlToSpeech(url) + " ";
  });

  processed = processed.replace(
    /\b([a-z0-9-]+\.)+[a-z]{2,}\b/gi,
    (domain) => " " + urlToSpeech(domain) + " "
  );

  processed = processed
    .replace(
      /([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/gi,
      "$1 at $2"
    )
    .replace(/\s-\s/g, " to ")
    .replace(/-/g, " ")
    .replace(/\b(\d+)\.(\d+)\b/g, "$1 point $2")
    .replace(/\b[0-9]+\b/g, (n) => numberToWords(n))
    .replace(/\s+/g, " ")
    .trim();

  return processed;
}

/* -----------------------------------------------------------
 * Safe JSON Extraction
 * -----------------------------------------------------------
 */
export function extractAndParseJson(text) {
  if (!text || typeof text !== "string") return null;

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
 * Prompt Builders
 * -----------------------------------------------------------
 */
export function getTitleDescriptionPrompt(mainOnly) {
  return `You are a creative copywriter for a premium artificial intelligence news podcast.
Using ONLY the main section of the script, generate:

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

export function getSEOKeywordsPrompt(description) {
  return `Generate 10–14 relevant SEO keywords (comma-separated, lower case, no hashtags).
Base them ONLY on this description:

${description}

Return ONLY the comma-separated keywords.`;
}

/* -----------------------------------------------------------
 * UPDATED Artwork Prompt (with subtle Turing-inspired motif)
 * -----------------------------------------------------------
 */
export function getArtworkPrompt(description) {
  const month = new Date().getMonth();
  let seasonal = "";

  if (month >= 2 && month <= 4) {
    seasonal = "spring pastels, fresh light";
  } else if (month >= 5 && month <= 7) {
    seasonal = "summer glow, vibrant warm tones";
  } else if (month >= 8 && month <= 10) {
    seasonal = "autumn amber, rich muted warmth";
  } else {
    seasonal = "winter cool hues, clean contrast";
  }

  return `
Create a high-end editorial illustration inspired directly by the MAIN section themes.
Focus on abstract representations of the artificial intelligence ideas described.
Style: modern abstract, cinematic depth, smooth gradients, organic flow, subtle reaction–diffusion patterns as a quiet homage to foundational AI theory, ${seasonal}.
Mood: intelligent, premium, conceptual clarity.
STRICT RULES:
- No humans
- No faces or silhouettes
- No robots
- No circuitry
- No text or lettering
- No intro/outro influence
- Abstract representation only
- ≤250 characters

MAIN DESCRIPTION:
${description}`.trim();
}

/* -----------------------------------------------------------
 * Episode Number Derivation
 * -----------------------------------------------------------
 */
const EPOCH_DATE = new Date("2025-01-01");

function deriveEpisodeNumberFromSessionId(id) {
  if (!id || typeof id !== "string") return null;

  const match = id.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;

  const [, year, month, day] = match;
  const episodeDate = new Date(`${year}-${month}-${day}`);
  if (Number.isNaN(episodeDate.getTime())) return null;

  const daysSinceEpoch = Math.floor(
    (episodeDate - EPOCH_DATE) / (1000 * 60 * 60 * 24)
  );

  return Math.max(1, daysSinceEpoch + 1);
}

const DEFAULT_KEYWORDS = [
  "ai",
  "artificial intelligence",
  "machine learning",
  "technology",
  "innovation",
  "automation",
  "tech news",
  "future tech",
];

function normalizeKeywords(input, maxCount = 14) {
  if (!input) return [];

  let raw = Array.isArray(input) ? input.join(",") : String(input);

  let keywords = raw
    .replace(/\s*\n+\s*/g, " ")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((k) => k && k.length > 2);

  keywords = [...new Set(keywords)];

  if (keywords.length < 10) {
    const combined = [...keywords, ...DEFAULT_KEYWORDS];
    keywords = [...new Set(combined)];
  }

  return keywords.slice(0, maxCount);
}

/* -----------------------------------------------------------
 * MAIN: Episode Meta Builder
 * -----------------------------------------------------------
 */
export async function generateEpisodeMetaLLM(rawTranscript, sessionMeta = {}) {
  const id = sessionMeta?.sessionId || sessionMeta?.id || "episode";
  const date = sessionMeta?.date || new Date().toISOString();

  const opStatus = {
    mainExtract: { success: false, fallback: false },
    titleDesc: { success: false, fallback: false },
    keywords: { success: false, fallback: false },
    artwork: { success: false, fallback: false, cached: false },
    episodeNumber: { value: 1, source: "default" }
  };

  /* 1. Extract MAIN ONLY */
  let mainOnly = "";
  try {
    const extracted = extractMainContent(rawTranscript);
    if (!extracted || extracted.length < 40) throw new Error("Main content too short.");

    mainOnly = sanitizeForSpeech(extracted);
    opStatus.mainExtract.success = true;
  } catch {
    error("meta.main.extract.fail", { sessionId: id });
    mainOnly = sanitizeForSpeech(rawTranscript || "");
    opStatus.mainExtract.fallback = true;
  }

  /* 2. Title + Description */
  let title = "AI Weekly";
  let description = "Latest artificial intelligence developments explained clearly.";

  try {
    const td = await resilientRequest("podcastHelper", {
      sessionId: id,
      section: "meta-title-description",
      messages: [{ role: "user", content: getTitleDescriptionPrompt(mainOnly) }],
    });

    const parsed = extractAndParseJson(td);

    if (parsed?.title) title = parsed.title.trim();
    if (parsed?.description) description = parsed.description.trim();

    title = title.slice(0, 160);
    description = description.slice(0, 4000);

    opStatus.titleDesc.success = true;
  } catch (err) {
    error("meta.titleDesc.fail", { sessionId: id, err: String(err) });
    opStatus.titleDesc.fallback = true;
  }

  if (!title.trim()) title = `AI News — ${date.slice(0, 10)}`;
  if (!description.trim()) description = "A deep dive into the latest AI and technology news.";

  const safeDescription = sanitizeForSpeech(description);

  /* 3. SEO */
  let keywords = [];
  try {
    const kw = await resilientRequest("seoKeywords", {
      sessionId: id,
      section: "meta-seo",
      messages: [{ role: "user", content: getSEOKeywordsPrompt(safeDescription) }],
    });

    keywords = normalizeKeywords(kw);
    opStatus.keywords.success = true;
  } catch {
    error("meta.seo.fail", { sessionId: id });
    keywords = DEFAULT_KEYWORDS.slice(0, 10);
    opStatus.keywords.fallback = true;
  }

  /* 4. Artwork Prompt */
  let artworkPrompt =
    "Professional editorial illustration of artificial intelligence concepts, elegant gradients, flowing organic shapes, sophisticated composition, no text";

  try {
    const ap = await resilientRequest("artworkPrompt", {
      sessionId: id,
      section: "meta-artwork",
      messages: [{ role: "user", content: getArtworkPrompt(safeDescription) }],
    });

    let prompt = String(ap).trim().replace(/^["'`]+|["'`]+$/g, "");

    if (prompt.length > 10 && prompt.length <= 250) {
      artworkPrompt = prompt;
      opStatus.artwork.success = true;
    } else {
      opStatus.artwork.fallback = true;
    }

    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", artworkPrompt);
    opStatus.artwork.cached = true;
  } catch {
    error("meta.artwork.fail", { sessionId: id });
    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", artworkPrompt);
    opStatus.artwork.fallback = true;
    opStatus.artwork.cached = true;
  }

  /* 5. Episode Number */
  let episodeNumber = 1;
  try {
    if (sessionMeta?.episodeNumber != null) {
      episodeNumber = Math.max(1, Number(sessionMeta.episodeNumber));
      opStatus.episodeNumber.source = "explicit";
    } else {
      const useEpisodeNumbers =
        String(process.env.PODCAST_RSS_EP || "").toLowerCase() === "yes";

      if (useEpisodeNumbers) {
        const derived = deriveEpisodeNumberFromSessionId(id);
        episodeNumber = Number.isFinite(derived) ? derived : 1;
        opStatus.episodeNumber.source = "derived";
      } else {
        episodeNumber = 1;
        opStatus.episodeNumber.source = "disabled";
      }
    }
  } catch {
    episodeNumber = 1;
    opStatus.episodeNumber.source = "error_fallback";
  }

  if (!Number.isFinite(episodeNumber) || episodeNumber < 1) episodeNumber = 1;

  /* Final Meta Object */
  const meta = {
    session: { sessionId: id, date },
    title,
    description,
    keywords,
    artworkPrompt,
    episodeNumber,
    createdAt: new Date().toISOString(),
  };

  info("🔗 meta.generation.complete");
  debug("🔗 meta.generation.complete", {
    sessionId: id,
    episodeNumber,
    opStatus,
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
