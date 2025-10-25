// services/script/utils/orchestrator.js

import { info, error } from "#logger.js";
import {
  generateIntro,
  generateMain,
  generateOutro,
  generateComposedEpisode,
} from "./models.js";

/**
 * Orchestrates the full podcast episode creation.
 * Runs intro → main → outro → compose in sequence.
 */
export async function orchestrateEpisode({
  date,
  newsItems = [],
  tone = {},
  siteUrl = "https://jonathan-harris.online",
} = {}) {
  try {
    info("script.orchestrate.start", { date, newsItemsCount: newsItems.length });

    // Step 1: INTRO
    const introText = await generateIntro({ date, tone });
    info("script.orchestrate.step", { step: "intro", success: !!introText });

    // Step 2: MAIN
    const mainText = await generateMain({ date, newsItems, tone });
    info("script.orchestrate.step", { step: "main", success: !!mainText });

    // Step 3: OUTRO
    const outroText = await generateOutro({
      date,
      episodeTitle: "AI Weekly Highlights",
      siteUrl,
      expectedCta: "Check out more on Jonathan-Harris.online",
      tone,
    });
    info("script.orchestrate.step", { step: "outro", success: !!outroText });

    // Step 4: COMPOSE
    const { composedText, metadata } = await generateComposedEpisode({
      introText,
      mainText,
      outroText,
      tone,
    });
    info("script.orchestrate.step", { step: "compose", success: !!composedText });

    return {
      ok: true,
      introText,
      mainText,
      outroText,
      composedText,
      metadata,
    };
  } catch (err) {
    error("script.orchestrate.fail", { err: err.message });
    return { ok: false, error: err.message };
  }
}

export default { orchestrateEpisode };
