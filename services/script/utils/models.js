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
// 🧩 Intro Section
// ─────────────────────────────────────────────────────────────
export async function generateIntro(sessionId) {
  try {
    const weatherSummary = "Overcast and drizzly — perfect AI podcast weather.";
    const turingQuote =
      "We can only see a short distance ahead, but we can see plenty there that needs to be done.";
    const prompt = getIntroPrompt({ weatherSummary, turingQuote });

    if (!prompt || typeof prompt !== "string") {
      throw new Error("Invalid intro prompt generated");
    }

    return await resilientRequest("scriptIntro", {
      sessionId,
      section: "intro",
      messages: [{ role: "system", content: prompt }],
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

    return await resilientRequest("scriptMain", {
      sessionId,
      section: "main",
      messages: [{ role: "system", content: prompt }],
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

    return await resilientRequest("scriptOutro", {
      sessionId,
      section: "outro",
      messages: [{ role: "system", content: prompt }],
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

    // Validate all parts are present
    if (!intro || !main || !outro) {
      throw new Error(
        `Missing episode parts: intro=${!!intro}, main=${!!main}, outro=${!!outro}`
      );
    }

    // Normalize sessionId without mutating parameter
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

    // Upload individual chunks
    const chunkPromises = chunks.map((chunk, index) =>
      putText("raw-text", `${normalizedSessionId}/chunk_${index + 1}.txt`, chunk)
    );
    await Promise.all(chunkPromises);

    // Generate and upload metadata
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
