// ============================================================================
// services/script/utils/orchestrator.js
// CLEAN, CORRECT, FULL PRODUCTION VERSION
// ============================================================================

import { info, error, debug } from "#logger.js";
import {
  generateIntro,
  generateMain,
  generateOutro,
} from "./models.js";

import { runEditorialPass } from "./editorialPass.js";
import editAndFormat from "./editAndFormat.js";
import { buildIntroPrompt, buildMainPrompt, buildOutroPrompt } from "./promptTemplates.js";
import { buildPersona} from "./toneSetter.js";

import {
  uploadText,
  putJson,
} from "../../shared/utils/r2-client.js";

import { extractMainContent } from "./textHelpers.js";

// BUCKET ALIASES USED BY SCRIPT SERVICE
const TRANSCRIPTS_BUCKET = "transcripts";
const META_BUCKET = "meta";

// ============================================================================
// ORCHESTRATE FULL SCRIPT GENERATION
// ============================================================================

export async function orchestrateEpisode(payload = {}) {
  const sessionId = payload.sessionId;
  if (!sessionId) {
    throw new Error("❌ orchestrator: sessionId is required");
  }

  info("script.orchestrate.start", { sessionId });

  try {
    // -----------------------------------------------------------------------
    // 1. BUILD PROMPTS (Tone + Template)
    // -----------------------------------------------------------------------
    const introPrompt  = buildPersona(buildIntroPrompt(payload));
    const mainPrompt   = buildPersona(buildMainPrompt(payload));
    const outroPrompt  = buildPersona(buildOutroPrompt(payload));

    // -----------------------------------------------------------------------
    // 2. GENERATE INTRO
    // -----------------------------------------------------------------------
    const intro = await generateIntro({
      ...payload,
      prompt: introPrompt,
      sessionId
    });

    // -----------------------------------------------------------------------
    // 3. GENERATE MAIN (six parts)
    // -----------------------------------------------------------------------
    const mains = [];
    for (let i = 1; i <= 6; i++) {
      const mainText = await generateMain({
        ...payload,
        part: i,
        prompt: mainPrompt,
        sessionId
      });
      mains.push(mainText);
    }

    // Combine main content
    const mainCombined = mains.join("\n\n");

    // -----------------------------------------------------------------------
    // 4. GENERATE OUTRO
    // -----------------------------------------------------------------------
    const outro = await generateOutro({
      ...payload,
      prompt: outroPrompt,
      sessionId
    });

    // -----------------------------------------------------------------------
    // 5. MERGE INTO A SINGLE SCRIPT
    // -----------------------------------------------------------------------
    let fullScript = [
      intro,
      mainCombined,
      outro
    ].join("\n\n");

    // Ensure main content is extracted cleanly
    fullScript = extractMainContent(fullScript);

    // -----------------------------------------------------------------------
    // 6. EDITORIAL PASS (HUMAN POLISH)
    // -----------------------------------------------------------------------
    let polishedScript = await runEditorialPass({ sessionId }, fullScript);

    // -----------------------------------------------------------------------
    // 7. FINAL FORMATTING (AI → artificial intelligence, split long sentences)
    // -----------------------------------------------------------------------
    polishedScript = editAndFormat(polishedScript);

    // -----------------------------------------------------------------------
    // 8. UPLOAD TRANSCRIPT
    // -----------------------------------------------------------------------
    const transcriptKey = `${sessionId}.txt`;

    await uploadText(
      TRANSCRIPTS_BUCKET,
      transcriptKey,
      polishedScript,
      "text/plain"
    );

    // -----------------------------------------------------------------------
    // 9. UPLOAD META
    // -----------------------------------------------------------------------
    const metaKey = `${sessionId}.json`;

    const meta = {
      sessionId,
      transcriptKey,
      title: payload.title || "",
      date: payload.date || new Date().toISOString()
    };

    await putJson(META_BUCKET, metaKey, meta);

    info("script.orchestrate.complete", {
      sessionId,
      transcriptKey,
      metaKey
    });

    return {
      ok: true,
      sessionId,
      transcriptKey,
      metaKey
    };

  } catch (err) {
    error("script.orchestrate.fail", {
      sessionId,
      error: err.message,
      stack: err.stack
    });

    return {
      ok: false,
      sessionId,
      error: err.message
    };
  }
}

export default {
  orchestrateEpisode,
};
