// ====================================================================
// editorialPass.js – Human-Style Production Version
// ====================================================================
// - Transforms AI-generated text into natural human writing
// - Bypasses AI detection through natural variation and imperfection
// - Maintains conversational British Gen-X tone
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
- People repeat themselves slightly when emphasizing points
- Thoughts sometimes circle back or digress briefly
- Natural speech has rhythmic variation, not uniform structure
- Speakers use metaphors and comparisons spontaneously
- Real conversations include throwaway phrases and asides
- Tone shifts naturally between serious and lighter moments

BRITISH GEN-X VOICE:
- Dry wit with occasional sarcasm
- Understated rather than enthusiastic
- Self-deprecating humor where appropriate
- Cultural references feel organic, not forced
- Skeptical but not cynical
- Conversational without being overly casual

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
- Maintain the original structure and flow
- Keep it suitable for text-to-speech (no complex formatting)
- Output plain text only - no markdown, lists, or special characters
- Do NOT add new information or change the order of topics
- Remove any obviously AI phrases like "delve into", "it's important to note", "furthermore"

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
    
    // Multiple enhancement passes for maximum humanization
    let enhanced = await resilientRequest("editorial-pass", {
      sessionId,
      section: "editorial-humanization",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.9  // Higher temperature for more natural variation
    });

    if (!enhanced) {
      warn("editorialPass.emptyResponse", { sessionId });
      return scriptText;
    }

    // Optional second pass for variety check
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
  // Add natural spacing variations
  let humanized = text.replace(/\n{3,}/g, '\n\n');
  
  // Ensure varied paragraph lengths by occasionally combining or splitting
  const paragraphs = humanized.split('\n\n');
  
  // Natural variation in spacing (occasionally three breaks for dramatic pause)
  for (let i = 0; i < paragraphs.length - 1; i++) {
    if (Math.random() < 0.15) {  // 15% chance of dramatic pause
      paragraphs[i] = paragraphs[i] + '\n';
    }
  }
  
  return paragraphs.join('\n\n');
}

export default { runEditorialPass };
