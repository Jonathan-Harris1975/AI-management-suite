// ====================================================================
// editorialPass.js – Full Production Version
// ====================================================================
// - Light polish for the full script (intro + main + outro)
// - Conversational British tone
// - Removes stiff/essay-like structures
// - Adds spoken-English pacing
// ====================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { info, warn, error } from "#logger.js";

function buildEnhancedPrompt(scriptText) {
  return `
You are a human editor polishing a spoken podcast script.

GOALS:
- Make the script sound naturally spoken, not written.
- Maintain the British Gen-X tone: dry, wry, understated.
- Improve flow, pacing, and clarity.
- Remove stiff, essay-like sentences.
- Avoid repetitive phrasing.
- Keep meaning EXACT and structure identical.
- Do NOT add new facts or change order.

TTS RULES:
- Break up overly long sentences.
- Keep paragraphs short and natural.
- Remove robotic connectors ("in addition", "moreover", etc.).
- No markdown, no lists, no formatting — plain text ONLY.

SCRIPT TO EDIT:
${scriptText}

Return ONLY the revised script as plain text.
`.trim();
}

export async function runEditorialPass(meta = {}, scriptText = "") {
  if (!scriptText) {
    warn("editorialPass.skip.empty");
    return scriptText;
  }

  const sessionId = meta.sessionId || "session";

  try {
    const prompt = buildEnhancedPrompt(scriptText);
    const edited = await resilientRequest("editorial-pass", {
      sessionId,
      section: "editorial-pass",
      messages: [{ role: "user", content: prompt }]
    });

    if (!edited) {
      warn("editorialPass.emptyResponse", { sessionId });
      return scriptText;
    }

    info("editorialPass.complete", {
      sessionId,
      original: scriptText.length,
      edited: edited.length
    });

    return edited.trim();
  } catch (err) {
    error("editorialPass.fail", { sessionId, err: String(err) });
    return scriptText;
  }
}

export default { runEditorialPass };
