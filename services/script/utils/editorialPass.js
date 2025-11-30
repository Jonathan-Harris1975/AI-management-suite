// ====================================================================
// editorialPass.js – Light polish for full script
// ====================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { info, error } from "#logger.js";
import { extractMainContent } from "./textHelpers.js";

function buildEditorialPrompt(scriptText) {
  return `
You are editing a full podcast script for Turing’s Torch: AI Weekly.

Goals:
- Keep the British Gen-X tone: dry, witty, but never cruel.
- Improve pacing, clarity, and flow.
- Remove repetition and over-formal phrasing.
- Keep it 100% TTS-friendly: no headings, no bullet points, no stage directions.
- Do NOT invent new stories or facts; only improve how the existing text is written.

Return ONLY the edited script as plain text.
Here is the script:

${scriptText}
`.trim();
}

export async function runEditorialPass(sessionId, scriptText) {
  if (!scriptText || typeof scriptText !== "string") {
    return "";
  }

  try {
    const prompt = buildEditorialPrompt(scriptText);

    const res = await resilientRequest({
      routeName: "editorialPass",
      sessionId,
      messages: [
        { role: "system", content: "You are a human podcast script editor." },
        { role: "user", content: prompt },
      ],
      max_tokens: 4000,
    });

    const edited = extractMainContent(res?.content || res || scriptText);
    info("editorialPass.complete", {
      sessionId,
      original: scriptText.length,
      edited: edited.length,
    });

    return edited.trim();
  } catch (err) {
    error("editorialPass.fail", { sessionId, error: String(err) });
    return scriptText;
  }
}

export default { runEditorialPass };
