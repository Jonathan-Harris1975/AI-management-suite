
/**
 * Extracts a JSON object from a string (handles Markdown code blocks or LLM explanations)
 */
function extractAndParseJson(text) {
  if (!text || typeof text !== 'string') return null;
  const startIndex = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) return null;
  try {
    return JSON.parse(text.substring(startIndex, endIndex + 1));
  } catch {
    return null;
  }
}

/**
 * Generates a prompt for the LLM to create title and description.
 */
function getTitleDescriptionPrompt(transcript) {
  return `You are a creative copywriter for an AI news podcast. Based on the following transcript, generate a short, punchy title and human-like description.

**Transcript:**
${transcript}

**Output:**
\`\`\`json
{
  "title": "Your Title",
  "description": "Your engaging summary."
}
\`\`\``;
}

/**
 * Generates SEO keywords prompt.
 */
function getSEOKeywordsPrompt(description) {
  return `Generate 8–14 relevant SEO keywords (comma-separated) for this description:
${description}`;
}

/**
 * Generates artwork prompt for Gemini or DALL·E.
 */
function getArtworkPrompt(description) {
  return `Create a vivid, abstract image prompt based on the following description:
${description}`;
}

/**
 * High-level orchestrator — this is what models.js calls.
 * It builds the metadata for an episode using all the helper functions.
 */
export async function generateEpisodeMeta({ intro, main, outro }) {
  const transcript = `${intro}\n\n${main}\n\n${outro}`;

  const titleDescPrompt = getTitleDescriptionPrompt(transcript);
  const seoPrompt = getSEOKeywordsPrompt(transcript);
  const artworkPrompt = getArtworkPrompt(transcript);

  // These could later be passed through resilientRequest() if needed.
  const metadata = {
    titlePrompt: titleDescPrompt,
    seoPrompt,
    artworkPrompt,
    createdAt: new Date().toISOString(),
  };

  return metadata;
}

export {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt
};
