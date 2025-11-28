// services/script/utils/editorialPass.js

import { resilientRequest } from "../../shared/utils/ai-service.js";
import * as sessionCache from "./sessionCache.js";
import { info, warn, error, debug } from "#logger.js";

function isEditorialEnabled() {
  const flag = String(process.env.ENABLE_EDITORIAL_PASS || "").toLowerCase();
  return flag === "yes" || flag === "true" || flag === "on";
}

function buildEditorialPrompt(scriptText) {
  return `
You are a careful human editor doing a *light* polish on a scripted AI news podcast episode.

CONTEXT:
- The host is a British Gen X narrator: dry wit, understated, no fake hype.
- The show covers AI, tech news, and analysis.
- The script you receive has already been structured into sections
  (intro, weather, main analysis, outro, etc.).
- This is going to TTS, so it must sound natural when spoken aloud.

YOUR JOB:
- Do a *light* editorial pass only.
- Keep the structure, order of sections, and meaning identical.
- Improve clarity, flow, and pacing.
- Remove obvious repetition, generic filler, and clunky phrasing.
- Adjust sentences so they sound like natural spoken English.
- Keep the tone: British, Gen X, slightly sardonic but never cruel.
- Avoid jargon overload. Keep it clear and conversational.
- Do NOT add new facts, stats, or claims.
- Do NOT invent URLs, brands, or sponsors.
- Do NOT remove existing section markers if present (e.g. INTRO:, OUTRO:, [SFX], etc.).
- Do NOT change any explicit time references or dates.

TTS-SPECIFIC RULES:
- Make sentences readable out loud. Shorten overly long sentences.
- Avoid "as mentioned earlier" and similar callbacks where possible.
- Keep contractions natural: "don't", "won't", "you're", etc.
- Do NOT insert markdown, lists, or formatting symbols.
- Return plain text only.

EXTREMELY IMPORTANT:
- Do NOT output JSON, markdown, code fences, or explanations.
- Return ONLY the edited script as plain text.
- The length should be within ±10% of the original word count.

--------------------------------
ORIGINAL SCRIPT:
${scriptText}
--------------------------------

Return ONLY the edited script as plain text, nothing else.
  `.trim();
}

export async function runEditorialPass(sessionMeta = {}, scriptText = "") {
  const sessionId = sessionMeta?.sessionId || sessionMeta?.id || "episode";

  if (!scriptText || typeof scriptText !== "string") {
    warn("editorialPass.skip.invalidInput", { sessionId });
    return scriptText || "";
  }

  if (!isEditorialEnabled()) {
    debug("editorialPass.disabled", { sessionId });
    return scriptText;
  }

  const originalLength = scriptText.length;
  info("✏️ editorialPass.start", { sessionId, chars: originalLength });

  const prompt = buildEditorialPrompt(scriptText);

  try {
    const edited = await resilientRequest("editorialPass", {
      sessionId,
      section: "script-editorial-pass",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    if (!edited || typeof edited !== "string") {
      warn("editorialPass.emptyResponse", { sessionId });
      return scriptText;
    }

    const cleaned = edited.trim();
    const editedLength = cleaned.length;

    if (!cleaned) {
      warn("editorialPass.cleanedEmpty", { sessionId });
      return scriptText;
    }

    const ratio = editedLength / originalLength;
    if (ratio < 0.5 || ratio > 1.5) {
      warn("editorialPass.lengthOutOfRange", {
        sessionId,
        originalLength,
        editedLength,
        ratio,
      });
      return scriptText;
    }

    try {
      await sessionCache.storeTempPart(sessionMeta, "editedScript", cleaned);
    } catch (cacheErr) {
      debug("editorialPass.cache.fail", {
        sessionId,
        err: String(cacheErr),
      });
    }

    info("✏️ editorialPass.complete", {
      sessionId,
      originalLength,
      editedLength,
      ratio: Number(ratio.toFixed(2)),
    });

    return cleaned;
  } catch (err) {
    error("editorialPass.fail", {
      sessionId,
      err: String(err),
    });
    return scriptText;
  }
}

export default {
  runEditorialPass,
};
