// services/script/utils/models.js
import { resilientRequest } from "../../shared/utils/ai-service.js";
import {
  getIntroPrompt,
  getMainPrompt,
  getOutroPromptFull,
} from "./promptTemplates.js";
import fetchFeedArticles from "./fetchFeeds.js";
import { putText, putJson } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import chunkText from "./chunkText.js";
import { generateEpisodeMeta } from "./podcastHelpers.js";
import { getAllParts } from "./sessionCache.js";
import { getWeatherSummary } from "./getWeatherSummary.js";
import { getTuringQuote } from "./getTuringQuote.js";

// ─────────────────────────────────────────────────────────────
// 🛠️ Helper: Normalize sessionId to string
// ─────────────────────────────────────────────────────────────
function normalizeSessionId(sessionId) {
  if (typeof sessionId === "object" && sessionId !== null) {
    return sessionId.id || sessionId.sessionId || String(sessionId);
  }
  return String(sessionId);
}

// ─────────────────────────────────────────────────────────────
// 🧩 Intro Section (updated to use real utilities)
// ─────────────────────────────────────────────────────────────
export async function generateIntro(sessionId) {
  try {
    // Fetch dynamic data for intro
    const weatherSummary = await getWeatherSummary();
    const turingQuote = await getTuringQuote();

    // Build dynamic intro prompt
    const prompt = getIntroPrompt({ weatherSummary, turingQuote });

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      throw new Error("Invalid intro prompt generated");
    }

    // Enforce plain-text output
    const systemPrompt = `
${prompt}

IMPORTANT INSTRUCTIONS:
- Produce a clean, plain text intro script only.
- No stage directions, sound cues, or show notes.
- Keep transitions smooth from weather → quote → main theme.
- Maintain the existing persona tone.`;

    return await resilientRequest("scriptIntro", {
      sessionId,
      section: "intro",
      messages: [{ role: "system", content: systemPrompt }],
    });
  } catch (error) {
    console.error(`[generateIntro] Failed for session ${sessionId}:`, error);
    throw new Error(`Failed to generate intro: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 🧩 Main Section
// ─────────────────────────────────────────────────────────────
export async function generateMain(sessionId) {
  try {
    const feedUrl = process.env.FEED_URL;
    if (!feedUrl) {
      throw new Error("FEED_URL environment variable not configured");
    }

    const articles = await fetchFeedArticles(feedUrl);

    if (!Array.isArray(articles) || articles.length === 0) {
      throw new Error("No articles fetched from feed");
    }

    const prompt = getMainPrompt({ articles, targetDuration: 60 });

    if (!prompt || typeof prompt !== "string") {
      throw new Error("Invalid main prompt generated");
    }

    // Explicitly require plain text narrative
    const systemPrompt = `
${prompt}

CRITICAL OUTPUT RULES:
- Plain text only (no scene directions, music, or structural notes).
- Natural human voice, continuous flow.`;

    return await resilientRequest("scriptMain", {
      sessionId,
      section: "main",
      messages: [{ role: "system", content: systemPrompt }],
    });
  } catch (error) {
    console.error(`[generateMain] Failed for session ${sessionId}:`, error);
    throw new Error(`Failed to generate main section: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 🧩 Outro Section
// ─────────────────────────────────────────────────────────────
export async function generateOutro(sessionId) {
  try {
    const prompt = await getOutroPromptFull();

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 10) {
      throw new Error("Invalid outro prompt — empty or malformed content");
    }

    const systemPrompt = `
${prompt}

STRICT OUTPUT RULES:
- Plain text only (no music, no production notes).
- Maintain continuity and tone consistency from previous sections.`;

    return await resilientRequest("scriptOutro", {
      sessionId,
      section: "outro",
      messages: [{ role: "system", content: systemPrompt }],
    });
  } catch (error) {
    console.error(`[generateOutro] Failed for session ${sessionId}:`, error);
    throw new Error(`Failed to generate outro: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 🧩 Combine + Upload Transcript / Metadata
// ─────────────────────────────────────────────────────────────
export async function finalizeAndUpload(sessionId) {
  try {
    const { intro, main, outro } = await getAllParts(sessionId);

    if (!intro || !main || !outro) {
      throw new Error(
        `Missing episode parts: intro=${!!intro}, main=${!!main}, outro=${!!outro}`
      );
    }

    const normalizedSessionId = normalizeSessionId(sessionId);

    // Combine and clean transcript
    const fullTranscript = cleanTranscript(`${intro}\n\n${main}\n\n${outro}`);

    if (!fullTranscript || fullTranscript.trim().length === 0) {
      throw new Error("Generated transcript is empty after cleaning");
    }

    const chunks = chunkText(fullTranscript);

    if (!Array.isArray(chunks) || chunks.length === 0) {
      throw new Error("Failed to chunk transcript");
    }

    // Upload full transcript
    await putText("transcript", `${normalizedSessionId}.txt`, fullTranscript);

    // Upload each text chunk
    const chunkPromises = chunks.map((chunk, index) =>
      putText("rawText", `${normalizedSessionId}/chunk_${index + 1}.txt`, chunk)
    );
    await Promise.all(chunkPromises);

    // Generate metadata
    const metadata = await generateEpisodeMeta({ intro, main, outro });

    if (!metadata || typeof metadata !== "object") {
      throw new Error("Invalid metadata generated");
    }

    await putJson("meta", `${normalizedSessionId}.json`, metadata);

    console.log(
      `[finalizeAndUpload] Successfully processed session ${normalizedSessionId}: ${chunks.length} chunks`
    );

    return { fullTranscript, chunks, metadata };
  } catch (error) {
    console.error(`[finalizeAndUpload] Failed for session ${sessionId}:`, error);
    throw new Error(`Failed to finalize and upload: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// 🧩 Unified entry point for orchestrator
// ─────────────────────────────────────────────────────────────
export async function generateComposedEpisode(sessionId) {
  try {
    console.log(`[generateComposedEpisode] Starting episode generation for session ${sessionId}`);

    const [intro, main, outro] = await Promise.all([
      generateIntro(sessionId),
      generateMain(sessionId),
      generateOutro(sessionId),
    ]);

    console.log(`[generateComposedEpisode] All sections generated, finalizing...`);

    const result = await finalizeAndUpload(sessionId);

    console.log(`[generateComposedEpisode] Episode generation complete for session ${sessionId}`);

    return result;
  } catch (error) {
    console.error(
      `[generateComposedEpisode] Fatal error for session ${sessionId}:`,
      error
    );
    throw new Error(`Failed to generate composed episode: ${error.message}`);
  }
}
