// ============================================================================
// services/script/utils/orchestrator.js
// Full script orchestration with:
// - weather + Turing quote
// - sponsor selection (single source of truth here)
// - models + promptTemplates + toneSetter
// - intro / main / outro generation
// - editorial pass
// - TTS cleanup
// - transcript saving
// - chunk creation
// - RSS-ready metadata (podcastHelper)
// ============================================================================

import { info, error } from "#logger.js";

import { uploadText, putJson } from "../../shared/utils/r2-client.js";

import getWeatherSummary from "./getWeatherSummary.js";
import getTuringQuote from "./getTuringQuote.js";
import getSponsor from "./getSponsor.js";
import generateCta from "./generateCta.js";

import {
  generateComposedEpisodeParts,
} from "./models.js";

import { runEditorialPass } from "./editorialPass.js";
import { cleanupFinal } from "./textHelpers.js";

import podcastHelper from "./podcastHelper.js";

import chunkText from "./chunkText.js";
import mainChunker from "./mainChunker.js";

// ============================================================================
// MAIN ORCHESTRATION FUNCTION
// ============================================================================
export async function orchestrateEpisode(input = {}) {
  const base = typeof input === "string" ? { sessionId: input } : (input || {});

  const now = new Date();
  let sessionId = base.sessionId || `TT-${now.toISOString().slice(0, 10)}`;
  const date = base.date || now.toISOString().slice(0, 10);
  const topic = base.topic || null;
  const tone = base.tone || { style: "genx" };

  info("script.orchestrate.start", { sessionId, date, topic });

  // ==========================================================================
  // 1. WEATHER + TURING QUOTE
  // ==========================================================================
  let weatherSummary = "";
  let turingQuote = "";

  try {
    weatherSummary = await getWeatherSummary();
    info("weather.ok", { sessionId });
  } catch (err) {
    error("weather.fail", { sessionId, error: String(err) });
  }

  try {
    turingQuote = await getTuringQuote();
    info("turingQuote.ok", { sessionId });
  } catch (err) {
    error("turingQuote.fail", { sessionId, error: String(err) });
  }

  // ==========================================================================
  // 2. SPONSOR SELECTION (single place)
  // ==========================================================================
  let sponsorBook = null;
  let sponsorCta = "";

  try {
    sponsorBook = getSponsor();
    sponsorCta = generateCta(sponsorBook);
    info("sponsor.selected", {
      sessionId,
      title: sponsorBook?.title || "unknown",
    });
  } catch (err) {
    error("sponsor.fail", { sessionId, error: String(err) });
    sponsorBook = null;
    sponsorCta = "";
  }

  // ==========================================================================
  // 3. GENERATE INTRO / MAIN / OUTRO VIA MODELS
  // ==========================================================================
  const modelCtx = {
    sessionId,
    date,
    topic,
    tone,
    weatherSummary,
    turingQuote,
    sponsorBook,
    sponsorCta,
  };

  const {
    intro,
    main,
    outro,
    formatted,
  } = await generateComposedEpisodeParts(modelCtx);

  const rawScript =
    formatted || [intro, main, outro].filter(Boolean).join("\n\n");

  // ==========================================================================
  // 4. EDITORIAL PASS + FINAL CLEANUP
  // ==========================================================================
  let edited = "";
  try {
    edited = await runEditorialPass(sessionId, rawScript);
  } catch (err) {
    error("editorial.fail", { sessionId, error: String(err) });
    edited = rawScript;
  }

  const finalFullText = cleanupFinal(edited);

  // ==========================================================================
  // 5. SAVE TRANSCRIPT → R2
  // ==========================================================================
  const transcriptKey = `${sessionId}.txt`;

  const transcriptUrl = await uploadText(
    "transcripts",
    transcriptKey,
    finalFullText,
    "text/plain",
  );

  // ==========================================================================
  // 6. CHUNK TRANSCRIPT → R2 (raw-text)
  // ==========================================================================
  const rawChunks = chunkText(finalFullText);
  const preparedChunks = mainChunker(rawChunks);

  let chunkIndex = 1;
  const chunkKeys = [];

  for (const chunk of preparedChunks) {
    const key = `${sessionId}/chunk-${String(chunkIndex).padStart(3, "0")}.txt`;
    await uploadText("raw-text", key, chunk, "text/plain");
    chunkKeys.push(key);
    chunkIndex += 1;
  }

  info("script.chunks.saved", { sessionId, count: chunkKeys.length });

  // ==========================================================================
  // 7. PODCAST META (title, description, keywords, artworkPrompt, episodeNumber)
  //    NOTE: sponsorBook / sponsorCta are NOT stored in meta (per Q5).
  // ==========================================================================
  const episodeMeta = await podcastHelper.generateEpisodeMetaLLM(
    finalFullText,
    {
      sessionId,
      date,
    },
  );

  // ==========================================================================
  // 8. FINAL COMPACT METADATA (RSS-ready)
  // ==========================================================================
  const metaKey = `${sessionId}.json`;
  const nowIso = now.toISOString();

  const meta = {
    sessionId,
    date,

    transcriptKey,
    transcriptUrl,

    chunks: chunkKeys,

    // --- Podcast Episode Metadata ---
    title: episodeMeta.title,
    description: episodeMeta.description,
    keywords: episodeMeta.keywords,
    artworkPrompt: episodeMeta.artworkPrompt,
    episodeNumber: episodeMeta.episodeNumber,

    // --- Context (minimal, no sponsor in persisted meta) ---
    weatherSummary,
    turingQuote,

    createdAt: nowIso,
    updatedAt: nowIso,
  };

  await putJson("meta", metaKey, meta);

  info("script.orchestrate.complete", {
    sessionId,
    transcriptKey,
    metaKey,
    chunkCount: chunkKeys.length,
  });

  return {
    ok: true,
    sessionId,
    transcriptKey,
    transcriptUrl,
    metaKey,
    meta,
  };
}

export default { orchestrateEpisode };
