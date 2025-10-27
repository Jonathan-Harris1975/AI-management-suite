import fs from "fs/promises";
import path from "path";
import { info, error } from "#logger.js";

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { uploadBuffer } from "../../shared/utils/r2-client.js"; // ✅ centralised R2 uploader

import promptTemplates from "./promptTemplates.js";
import { getWeatherSummary } from "./weather.js";
import { getTuringQuote } from "./getTuringQuote.js";
import getSponsor from "./getSponsor.js";
import generateCta from "./generateCta.js";

import {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt,
} from "./podcastHelpers.js";

const {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
  humanize,
  enforceTransitions,
  validateScript,
  validateOutro,
} = promptTemplates;

// ─────────────────────────────────────────────
// 🧩 Local save helper
// ─────────────────────────────────────────────
async function saveLocalSegment(name, text) {
  const dir = "/tmp/script_segments";
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.txt`);
  await fs.writeFile(filePath, text, "utf8");
  info("script.saveTempFile", { file: filePath });
  return filePath;
}

// ─────────────────────────────────────────────
// 🧩 Persist segment text + chunks to R2
// ─────────────────────────────────────────────
async function persistSegmentToR2(name, text) {
  try {
    // upload raw text version
    const keyText = `scripts/${name}-${Date.now()}.txt`;
    await uploadBuffer({
      bucket: process.env.R2_BUCKET_RAW_TEXT,
      key: keyText,
      body: Buffer.from(text, "utf8"),
    });

    // chunk logic: split every ~4000 chars for TTS
    const chunkSize = 4000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize));
    }

    for (let idx = 0; idx < chunks.length; idx++) {
      const keyChunk = `chunks/${name}/${Date.now()}-${idx}.txt`;
      await uploadBuffer({
        bucket: process.env.R2_BUCKET_RAW,
        key: keyChunk,
        body: Buffer.from(chunks[idx], "utf8"),
      });
    }

    info("script.persistSegmentToR2.success", { name, chunks: chunks.length });
  } catch (err) {
    error("script.persistSegmentToR2.fail", { err: err.message });
  }
}

// ─────────────────────────────────────────────
// 🧩 Persist transcript + metadata to R2
// ─────────────────────────────────────────────
async function persistEpisodeToR2(transcriptText, metadata) {
  try {
    const ts = Date.now();

    const transcriptKey = `transcripts/transcript-${ts}.txt`;
    await uploadBuffer({
      bucket: process.env.R2_BUCKET_PODCAST,
      key: transcriptKey,
      body: Buffer.from(transcriptText, "utf8"),
    });

    const metaKey = `metadata/metadata-${ts}.json`;
    await uploadBuffer({
      bucket: process.env.R2_META_BUCKET,
      key: metaKey,
      body: Buffer.from(JSON.stringify(metadata, null, 2), "utf8"),
    });

    info("script.persistEpisodeToR2.success", { transcriptKey, metaKey });
  } catch (err) {
    error("script.persistEpisodeToR2.fail", { err: err.message });
  }
}

// ─────────────────────────────────────────────
// INTRO — with weather + Turing quote
// ─────────────────────────────────────────────
export async function generateIntro({ date, tone = {} } = {}) {
  try {
    info("script.intro.req", { date });

    const weatherSummary =
      (await getWeatherSummary()) ||
      tone.weatherSummary ||
      "typical British drizzle over London";

    const turingQuote =
      (await getTuringQuote()) ||
      tone.turingQuote ||
      "We can only see a short distance ahead, but we can see plenty there that needs to be done.";

    const prompt = getIntroPrompt({ weatherSummary, turingQuote });
    const raw = await resilientRequest({ routeName: "intro", prompt });

    let outText = humanize(raw);
    outText = enforceTransitions(outText).trim();

    await saveLocalSegment("intro", outText);
    await persistSegmentToR2("intro", outText);

    return outText;
  } catch (err) {
    error("script.intro.fail", { err: err.message });
    throw err;
  }
}

// ─────────────────────────────────────────────
// MAIN — news body
// ─────────────────────────────────────────────
export async function generateMain({ date, newsItems = [], tone = {} } = {}) {
  try {
    let articles = [];
    if (Array.isArray(newsItems)) {
      articles = newsItems
        .filter(Boolean)
        .map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
    } else if (typeof newsItems === "object" && newsItems !== null) {
      articles = [Object.values(newsItems).join(" — ")];
    } else if (typeof newsItems === "string" && newsItems.trim()) {
      articles = [newsItems.trim()];
    }

    info("script.main.req", { count: articles.length });
    const prompt = getMainPrompt({
      articles,
      targetDuration: tone.targetDuration || 60,
    });

    const raw = await resilientRequest({ routeName: "main", prompt });
    const qa = validateScript(raw);
    if (!qa.isValid) error("script.main.validation", { violations: qa.violations });

    let outText = humanize(raw);
    outText = enforceTransitions(outText).trim();

    await saveLocalSegment("main", outText);
    await persistSegmentToR2("main", outText);

    return outText;
  } catch (err) {
    error("script.main.fail", { err: err.message });
    throw err;
  }
}

// ─────────────────────────────────────────────
// OUTRO — sponsor + CTA
// ─────────────────────────────────────────────
export async function generateOutro({ date } = {}) {
  try {
    info("script.outro.req", { date });

    const sponsor = await getSponsor();
    const cta = await generateCta(sponsor);
    const outroPrompt = await getOutroPromptFull(sponsor, cta);

    const raw = await resilientRequest({ routeName: "outro", prompt: outroPrompt });
    const qa = validateOutro(raw, cta, sponsor.title, sponsor.url);
    if (!qa.isValid) error("script.outro.validation", { issues: qa.issues });

    let outText = humanize(raw);
    outText = enforceTransitions(outText).trim();

    await saveLocalSegment("outro", outText);
    await persistSegmentToR2("outro", outText);

    return outText;
  } catch (err) {
    error("script.outro.fail", { err: err.message });
    throw err;
  }
}

// ─────────────────────────────────────────────
// COMPOSE — merge + metadata + upload
// ─────────────────────────────────────────────
export async function generateComposedEpisode({
  introText = "",
  mainText = "",
  outroText = "",
} = {}) {
  try {
    info("script.compose.start");

    const composedText = [introText, mainText, outroText]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n")
      .trim();

    const tdPrompt = getTitleDescriptionPrompt(composedText);
    const tdRaw = await resilientRequest({ routeName: "metadata", prompt: tdPrompt });
    const parsedMeta = extractAndParseJson(tdRaw) || {};

    const seoPrompt = getSEOKeywordsPrompt(parsedMeta.description || composedText);
    const seoRaw = await resilientRequest({ routeName: "metadata", prompt: seoPrompt });

    const artPrompt = getArtworkPrompt(parsedMeta.description || composedText);
    const artRaw = await resilientRequest({ routeName: "metadata", prompt: artPrompt });

    const metadata = {
      title: parsedMeta.title || "Untitled Episode",
      description: parsedMeta.description || "No description generated.",
      seoKeywords: typeof seoRaw === "string" ? seoRaw.trim() : JSON.stringify(seoRaw),
      artworkPrompt: typeof artRaw === "string" ? artRaw.trim() : JSON.stringify(artRaw),
    };

    info("script.compose.done", { title: metadata.title });

    await persistEpisodeToR2(composedText, metadata);

    return { composedText, metadata };
  } catch (err) {
    error("script.compose.fail", { err: err.message });
    throw err;
  }
}

export default {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
};
