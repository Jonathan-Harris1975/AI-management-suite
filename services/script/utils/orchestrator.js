// ============================================================================
// services/script/utils/orchestrator.js
// Full script orchestration with:
// - weather + Turing quote
// - sponsor selection
// - promptTemplates + toneSetter
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
import { selectRandomBook, buildSponsorCTA } from "./sponsorHelpers.js";

import { generateIntro, generateMain, generateOutro, generateComposedEpisodeParts } from "./models.js";

import { runEditorialPass } from "./editorialPass.js";
import { cleanupFinal } from "./textHelpers.js";

import promptTemplates from "./promptTemplates.js";
import { applyTone } from "./toneSetter.js";

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
  // 2. SPONSOR BOOK + CTA
  // ==========================================================================
  const sponsorBook = selectRandomBook();
  const sponsorCta = buildSponsorCTA(sponsorBook);

  // ==========================================================================
  // 3. BUILD PROMPTS USING promptTemplates + toneSetter
  // ==========================================================================
  const introPrompt = applyTone(
    promptTemplates.intro({ date, weatherSummary, turingQuote }),
    tone
  );

  const mainPrompt = applyTone(
    promptTemplates.main({ topic }),
    tone
  );

  const outroPrompt = applyTone(
    promptTemplates.outro({ sponsorBook, sponsorCta }),
    tone
  );

  // ==========================================================================
  // 4. GENERATE INTRO / MAIN / OUTRO
  // ==========================================================================
  let intro = "";
  let main = "";
  let outro = "";

  try {
    intro = await generateIntro({ prompt: introPrompt, sessionId });
    main = await generateMain({ prompt: mainPrompt, sessionId });
    outro = await generateOutro({ prompt: outroPrompt, sessionId });

    info("script.generators.ok", { sessionId });
  } catch (err) {
    error("script.generators.fail", { sessionId, error: String(err) });
    throw err;
  }

  // Combine before editorial pass
  const rawScript = [intro, main, outro].filter(Boolean).join("\n\n");

  // ==========================================================================
  // 5. EDITORIAL PASS + FINAL CLEANUP
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
  // 6. SAVE TRANSCRIPT → R2
  // ==========================================================================
  const transcriptKey = `${sessionId}.txt`;

  const transcriptUrl = await uploadText(
    "transcripts",
    transcriptKey,
    finalFullText,
    "text/plain"
  );

  // ==========================================================================
  // 7. CHUNK TRANSCRIPT → R2 (raw-text)
  // ==========================================================================
  const rawChunks = chunkText(finalFullText);
  const preparedChunks = mainChunker(rawChunks);

  let chunkIndex = 1;
  const chunkKeys = [];

  for (const chunk of preparedChunks) {
    const key = `${sessionId}/chunk-${String(chunkIndex).padStart(3, "0")}.txt`;
    await uploadText("raw-text", key, chunk, "text/plain");
    chunkKeys.push(key);
    chunkIndex++;
  }

  info("script.chunks.saved", { sessionId, count: chunkKeys.length });

  // ==========================================================================
  // 8. PODCAST META (title, description, keywords, artworkPrompt, episodeNumber)
  // ==========================================================================
  const episodeMeta = await podcastHelper.generateEpisodeMetaLLM(
    finalFullText,
    {
      sessionId,
      date,
      sponsorBook,
      sponsorCta,
    }
  );

  // ==========================================================================
  // 9. FINAL COMPACT METADATA (RSS-ready)
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

    // --- Context (minimal) ---
    weatherSummary,
    turingQuote,
    sponsorBook,
    sponsorCta,

    createdAt: nowIso,
    updatedAt: nowIso
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
    meta
  };
}

export default { orchestrateEpisode };
