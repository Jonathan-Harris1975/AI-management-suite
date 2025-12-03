// ====================================================================
// editorialPass.js – Human-Style Production Version
// ====================================================================
// - Transforms AI-generated text into natural human writing
// - Maintains conversational British radio Gen-X vibe (never named)
// - Preserves meaning while introducing human writing patterns
// ====================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { info, warn, error } from "#logger.js";

function buildHumanizedPrompt(scriptText) {
  return `
You are transforming a podcast script to sound authentically human-written and spoken.

CRITICAL ANTI-DETECTION REQUIREMENTS:
- Vary sentence structures dramatically (mix short punchy lines with longer flowing ones)
- Use contractions naturally and inconsistently (sometimes "cannot", sometimes "can't")
- Include minor imperfections: slight redundancies, natural fillers, conversational asides
- Vary rhythm and pacing throughout - avoid mechanical patterns
- Use unexpected word choices and phrasings occasionally
- Include natural hesitations and thought progressions ("I mean", "you know", "look")
- Break "rules" occasionally like starting sentences with "And" or "But"
- Use em-dashes, ellipses, and natural pauses inconsistently
- Vary paragraph lengths wildly (some single sentences, others longer)
- Mix formal and informal vocabulary unpredictably

HUMAN SPEECH PATTERNS:
- People repeat themselves slightly when emphasising points — but avoid thematic repetition or rehashing
- Thoughts sometimes digress briefly, but never loop back to earlier topics in a way that re-explains the same idea
- Natural rhythm with varied pacing
- Occasional metaphors and spontaneous comparisons
- Throwaway asides used sparingly
- Tone shifts naturally between serious and lighter moments
- Maintain clarity: remove accidental restatements of the same idea

BRITISH RADIO TONE (GEN-X VIBE WITHOUT EVER NAMING IT):
- Dry wit with that familiar Gen-X edge — but never explicitly mention generations
- Understated rather than enthusiastic
- Light, effortless sarcasm used naturally
- Cultural references can appear, but subtly and without labelling them
- Sceptical, observant, world-weary humour
- Conversational but articulate, like a seasoned broadcaster who’s seen a few cycles of hype
- Maintain the vibe, never the label

AUTHENTICITY MARKERS:
- Occasionally begin consecutive sentences differently than expected
- Use "I think", "perhaps", "maybe" to show human uncertainty
- Include personal observations or mild opinions
- Let some sentences be slightly awkward or imperfect
- Use active voice predominantly but passive occasionally for variation
- Include rhetorical questions sparingly
- Show personality through word choice, not just content

ABSOLUTE RULES:
- Preserve ALL factual content and core meaning
- Maintain the original structure and flow except where very small changes help intros/outros blend more naturally
- Keep it suitable for text-to-speech (no complex formatting)
- Output plain text only - no markdown, lists, or special characters
- Do NOT add new information or change the order of topics unless required for tiny narrative smoothing
- Remove any obviously AI phrases like "delve into", "it's important to note", "furthermore"
- Do NOT introduce repeated ideas, themes, or re-explanations. If the script revisits a topic, smooth it into one coherent passage and remove duplication.

Transform this script to sound like it was written by a real British podcaster who's articulate but naturally imperfect:

${scriptText}

Return ONLY the humanized script as plain text with natural variation throughout.
`.trim();
}

export async function runEditorialPass(meta = {}, scriptText = "") {
  if (!scriptText) {
    warn("editorialPass.skip.empty");
    return scriptText;
  }

  const sessionId = meta.sessionId || "session";

  try {
    const prompt = buildHumanizedPrompt(scriptText);

    let enhanced = await resilientRequest("editorial-pass", {
      sessionId,
      section: "editorial-humanization",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9
    });

    if (!enhanced) {
      warn("editorialPass.emptyResponse", { sessionId });
      return scriptText;
    }

    if (meta.doublePassEnabled) {
      const varietyPrompt = `
Review this script and ensure maximum natural variation:
- Check that sentence structures vary significantly
- Ensure no repetitive patterns in paragraph openings
- Verify natural imperfections are present
- Confirm the tone feels genuinely conversational

If needed, adjust to increase human-like variation while keeping all content identical:

${enhanced}

Return the final version as plain text.
`.trim();

      const finalPass = await resilientRequest("editorial-variety", {
        sessionId,
        section: "variety-check",
        messages: [{ role: "user", content: varietyPrompt }],
        temperature: 0.85
      });

      if (finalPass) {
        enhanced = finalPass;
      }
    }

    info("editorialPass.complete", {
      sessionId,
      original: scriptText.length,
      enhanced: enhanced.length,
      variationApplied: true
    });

    return enhanced.trim();
  } catch (err) {
    error("editorialPass.fail", { sessionId, err: String(err) });
    return scriptText;
  }
}

// Helper function to add post-processing humanization
function applyHumanizationLayer(text) {
  let humanized = text.replace(/\n{3,}/g, "\n\n");

  const paragraphs = humanized.split("\n\n");

  for (let i = 0; i < paragraphs.length - 1; i++) {
    if (Math.random() < 0.15) {
      paragraphs[i] = paragraphs[i] + "\n";
    }
  }

  return paragraphs.join("\n\n");
}

export default { runEditorialPass };
