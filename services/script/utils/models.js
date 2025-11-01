// services/script/utils/models.js
// Compose flow: build intro/main/outro to cache, edit + chunk for TTS,
// then save FULL transcript to transcripts and per-chunk files to rawtext,
// write TTS meta, then generate podcast metadata (title, description, SEO) and save to meta bucket.
// Artwork prompt is cached in memory only.

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getIntroPrompt, getMainPrompt, getOutroPromptFull } from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { putText, putJson } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import { calculateDuration } from "./durationCalculator.js";
import { getWeatherSummary } from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import editAndFormat from "./editAndFormat.js";
import chunkText from "./chunkText.js";
import { generateMainLongform } from "./mainChunker.js";
import * as sessionCache from "./sessionCache.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import { info } from "#logger.js";

function toPlainText(s) {
  if (!s) return "";
  return String(s)
    .replace(/\[(?:music|sfx|cue|intro|outro|.*?)]/gi, "")
    .replace(/\((?:music|sfx|cue|intro|outro|.*?)]?\)/gi, "")
    .replace(/\*{1,3}/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeOutput(s) {
  return cleanTranscript(toPlainText(s));
}

function normalizeSessionMeta(sessionIdLike) {
  if (typeof sessionIdLike === "string") {
    const m = sessionIdLike.match(/\d{4}-\d{2}-\d{2}/);
    return { sessionId: sessionIdLike, date: m ? m[0] : undefined };
  }
  if (typeof sessionIdLike === "object" && sessionIdLike) {
    return { sessionId: sessionIdLike.sessionId || "", date: sessionIdLike.date };
  }
  return { sessionId: "unknown", date: undefined };
}

export async function generateIntro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const weatherSummary = await getWeatherSummary();
  const turingQuote = await getTuringQuote();
  const prompt = getIntroPrompt({ weatherSummary, turingQuote, sessionMeta });

  const res = await resilientRequest("scriptIntro", {
    sessionId: sessionMeta,
    section: "intro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "intro", cleaned);
  return cleaned;
}

export async function generateMain(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);

  const { items, feedUrl } = await fetchFeedArticles();
  const articles = (items || []).map((it) => ({
    title: it?.title?.trim() || "",
    summary: it?.summary?.trim() || it?.contentSnippet?.trim() || it?.description?.trim() || "",
    link: it?.link || it?.url || "",
  })).filter(a => a.title || a.summary);

  const { mainSeconds, targetMins } = calculateDuration("main", sessionMeta, articles.length);
  info("script.main.runtimeTarget", { targetMins, mainSeconds, articleCount: articles.length, feedUrl });

  const combined = await generateMainLongform(sessionMeta, articles, mainSeconds);
  await sessionCache.storeTempPart(sessionMeta, "main", combined);
  return sanitizeOutput(combined);
}

export async function generateOutro(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);
  const prompt = await getOutroPromptFull(sessionMeta);

  const res = await resilientRequest("scriptOutro", {
    sessionId: sessionMeta,
    section: "outro",
    messages: [{ role: "system", content: prompt }],
  });

  const cleaned = sanitizeOutput(res);
  await sessionCache.storeTempPart(sessionMeta, "outro", cleaned);
  return cleaned;
}

export async function generateComposedEpisode(sessionIdLike) {
  const sessionMeta = normalizeSessionMeta(sessionIdLike);

  const introCached = await sessionCache.getTempPart(sessionMeta, "intro");
  const mainCached  = await sessionCache.getTempPart(sessionMeta, "main");
  const outroCached = await sessionCache.getTempPart(sessionMeta, "outro");

  const intro = introCached || await generateIntro(sessionMeta);
  const main  = mainCached  || await generateMain(sessionMeta);
  const outro = outroCached || await generateOutro(sessionMeta);

  const rawTranscript = [intro, "", main, "", outro].join("\n");
  const edited = editAndFormat(rawTranscript);

  // Create TTS chunks (sentence-first, byte-aware)
  const maxBytes = Number(process.env.MAX_SSML_CHUNK_BYTES || 4200);
  const byteLen = (s) => Buffer.byteLength(s, "utf8");
  let ttsChunks = chunkText(edited, maxBytes);

  // Safety net: if the transcript exceeds one chunk but we still got only one chunk -> force byte split
  if (ttsChunks.length <= 1 && byteLen(edited) > maxBytes) {
    info("tts.chunk.forceSplit", { reason: "single-chunk-too-large", editedBytes: byteLen(edited), maxBytes });
    const hardByteSplit = (text, cap) => {
      const out = [];
      let remaining = text.trim();
      while (Buffer.byteLength(remaining, "utf8") > cap) {
        let approx = Math.max(1000, Math.floor(cap * 0.9));
        let slice = remaining.slice(0, approx);
        const back = slice.lastIndexOf(" ");
        if (back > 200) slice = slice.slice(0, back);
        out.push(slice.trim());
        remaining = remaining.slice(slice.length).trim();
      }
      if (remaining) out.push(remaining);
      return out;
    };
    ttsChunks = hardByteSplit(edited, maxBytes);
  }

  const id = sessionMeta.sessionId || "episode";

  // --- Save: full transcript ONLY to transcripts
  await putText("transcripts", `${id}.txt`, edited);
  info("transcript.saved", { bucket: "transcripts", key: `${id}.txt` });

  // --- Save: per-chunk files ONLY to rawtext (key name per r2-client mapping)
  const files = [];
  let totalBytes = 0;
  for (let i = 0; i < ttsChunks.length; i++) {
    const n = String(i + 1).padStart(2, "0");
    const name = `${id}-tts-chunk-${n}.txt`;
    const body = ttsChunks[i];
    const bytes = byteLen(body);
    totalBytes += bytes;
    files.push({ name, bytes });
    await putText("rawtext", name, body);
  }
  info("tts.upload.summary", { bucket: "rawtext", chunks: files.length, totalBytes });

  // --- Save: TTS meta to meta bucket
  await putJson("meta", `${id}.json`, {
    session: sessionMeta,
    createdAt: new Date().toISOString(),
    tts: {
      bucket: "rawtext",
      count: files.length,
      maxBytes,
      files,
      totalBytes
    },
  });
  info("meta.saved", { bucket: "meta", key: `${id}.json` });

  // --- Generate PodcastHelper metadata (title, description, keywords). Artwork cached only.
  const meta = await generateEpisodeMetaLLM(edited, sessionMeta);
  await putJson("meta", `${id}-meta.json`, meta);
  info("meta.generated", { title: meta.title, keywords: meta.keywords?.length || 0, key: `${id}-meta.json` });

  return { transcript: edited, chunks: files.map(f => f.name), meta };
}

export default { generateIntro, generateMain, generateOutro, generateComposedEpisode };
