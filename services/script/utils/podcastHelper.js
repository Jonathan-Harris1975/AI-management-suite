import { resilientRequest } from "../../shared/utils/ai-service.js";
import * as sessionCache from "./sessionCache.js";
import { info, error } from "#logger.js";

export function extractAndParseJson(text) {
  if (!text || typeof text !== "string") return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

export function getTitleDescriptionPrompt(transcript) {
  return `You are a creative podcast copywriter for an AI insights show.
Using only the main body of the transcript (ignore intro/outro), generate a natural title and description.
Return compact JSON only:
{ "title": "Catchy human title", "description": "Engaging human summary." }

Transcript:
${transcript}`;
}

export function getSEOKeywordsPrompt(description) {
  return `Generate 10–14 concise SEO keywords (comma-separated, lowercase, no hashtags).
Focus on AI, technology, automation, innovation.
Description: ${description}`;
}

export function getArtworkPrompt(description) {
  return `Cinematic, abstract, futuristic artwork prompt under 250 chars.
Avoid human subjects. Based on this episode description: ${description}`;
}

export async function generateEpisodeMetaLLM(transcript, sessionMeta) {
  const id = sessionMeta?.sessionId || "episode";
  const date = sessionMeta?.date;
  const episodeNumber = sessionMeta?.episodeNumber || process.env.PODCAST_RSS_EP || "1";
  const trimmed = transcript.replace(/^(.{0,2000})/s, "");

  let title = "AI Weekly";
  let description = "Latest AI insights in a natural tone.";
  let keywords = [];
  let artworkPrompt = "";

  try {
    const td = await resilientRequest("podcastHelper", {
      sessionId: sessionMeta, section: "meta-title-description",
      messages: [{ role: "system", content: getTitleDescriptionPrompt(trimmed) }],
    });
    const parsed = extractAndParseJson(td);
    if (parsed?.title) title = parsed.title.trim();
    if (parsed?.description) description = parsed.description.trim();
  } catch (e) { error("meta.titleDesc.fail", { err: String(e) }); }

  try {
    const kw = await resilientRequest("seoKeywords", {
      sessionId: sessionMeta, section: "meta-seo",
      messages: [{ role: "system", content: getSEOKeywordsPrompt(description) }],
    });
    keywords = String(kw).split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  } catch (e) { error("meta.seo.fail", { err: String(e) }); }

  try {
    const ap = await resilientRequest("artworkPrompt", {
      sessionId: sessionMeta, section: "meta-artwork",
      messages: [{ role: "system", content: getArtworkPrompt(description) }],
    });
    artworkPrompt = String(ap).trim();
    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", artworkPrompt);
  } catch (e) {
    artworkPrompt = "Futuristic neon visualization of AI innovation";
    await sessionCache.storeTempPart(sessionMeta, "artworkPrompt", artworkPrompt);
  }

  return { session: { sessionId: id, date }, episodeNumber, title, description, keywords, artworkPrompt, createdAt: new Date().toISOString() };
}
