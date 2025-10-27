import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/podcastHelpers.js - The Correct and Complete Version

/**
 * Extracts a JSON object from a string that might contain other text,
 * like markdown code blocks (` ```json `) or explanations from an LLM.
 * This makes parsing LLM responses much more reliable.
 * @param {string} text - The raw text response from the LLM.
 * @returns {object | null} A parsed JavaScript object, or null if no valid JSON is found.
 */
function extractAndParseJson(text) {
  if (!text || typeof text !== 'string') {
    console.error("Invalid input to extractAndParseJson: not a string or empty.");
    return null;
  }

  // Find the first '{' and the last '}' to isolate the JSON object.
  const startIndex = text.indexOf('{');
  const endIndex = text.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    console.error("Could not find a JSON object in the LLM response text.");
    return null;
  }

  // Extract the potential JSON string.
  const jsonString = text.substring(startIndex, endIndex + 1);

  try {
    // Try to parse the extracted string.
    return JSON.parse(jsonString);
  } catch (error) {
    console.error("Failed to parse the extracted JSON string:", error);
    console.error("Extracted string that failed parsing was:", jsonString);
    return null;
  }
}

/**
 * Generates a prompt for an LLM to create a podcast title and description.
 * This prompt uses role-playing and explicit JSON formatting for reliable output.
 * @param {string} transcript - The transcript or summary of news items for the episode.
 * @returns {string} A string to be used as a prompt for an LLM.
 */
function getTitleDescriptionPrompt(transcript) {
  return `You are a creative copywriter for an AI news podcast. Based on the following news items, generate a punchy episode title and an engaging, human-toned description.

**News Items:**
${transcript}

**Constraints:**
- **Title:** Maximum 10 words. Capitalize major words. No hashtags, colons, or episode numbers.
- **Description:** Maximum 300 characters. Use a first-person singular voice ("I"). Summarize the items collectively, do not list them. Avoid meta-commentary like "In this episode...".

**Output:**
Respond using the following JSON object structure *only*. Do not add any other text or explanation.
\`\`\`json
{
  "title": "Your Punchy Episode Title Here",
  "description": "Your Engaging Episode Summary Here"
}
\`\`\``;
}

/**
 * Generates a prompt for an LLM to extract SEO keywords from a description.
 * This prompt uses role-playing and explicit output priming for a clean, comma-separated list.
 * @param {string} description - The podcast episode description.
 * @returns {string} A string to be used as a prompt for an LLM.
 */
function getSEOKeywordsPrompt(description) {
  return `You are an SEO expert specializing in the tech and AI podcasting space. Analyze the following episode description and extract 8 to 14 high-impact SEO keywords and phrases.

**Guidelines:**
- Focus on terms people would search for on Google, Spotify, or YouTube.
- Include a mix of short (1-2 word) and long-tail (3-4 word) phrases.
- Target themes of AI, technology, business, and innovation.

**Output Format:**
- A single line of text.
- Keywords separated by commas only.
- No numbers, no quotes, no headings, no explanations.

**Episode Description:**
${description}

**Keywords:`;
}

/**
 * Generates a prompt for an LLM to create an optimized image prompt.
 * This prompt instructs the LLM to act as a prompt engineer, creating a new, concise prompt
 * suitable for the Google Gemini 2.5 Flash image model on OpenRouter.
 * @param {string} description - The podcast episode description.
 * @returns {string} A string to be used as a prompt for an LLM.
 */
function getArtworkPrompt(description) {
  return `You are an expert prompt engineer for an AI image generation model (Google Gemini 2.5 Flash). Your task is to create a single, concise, and descriptive image prompt based on the podcast episode summary provided below.

**Instructions:**
1.  Read the episode summary to understand the core themes.
2.  Synthesize these themes into a visual concept.
3.  Describe this concept using a comma-separated list of descriptive keywords and phrases.
4.  Focus on abstract, visually rich concepts: digital landscapes, data streams, neural networks, geometric patterns, vibrant colors (deep blues, purples, neon highlights), and concepts of innovation or complexity.
5.  **Crucially, DO NOT include any text, letters, words, logos, or humanoid figures in your description.**

**Output Format:**
- A single sentence.
- Do not use quotes.
- Do not explain your reasoning.

**Episode Summary:**
${description}

**Image Prompt:`;
}

// This export block is the crucial part. It makes the functions available to other files.
export {
  extractAndParseJson,
  getTitleDescriptionPrompt,
  getSEOKeywordsPrompt,
  getArtworkPrompt
};
  
