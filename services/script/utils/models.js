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

export async function generateIntro(sessionId) {
  const weatherSummary =
    "Overcast and drizzly — perfect AI podcast weather.";
  const turingQuote =
    "We can only see a short distance ahead, but we can see plenty there that needs to be done.";
  const prompt = getIntroPrompt({ weatherSummary, turingQuote });

  // ✅ FIXED: pass route key, not raw prompt
  return await resilientRequest("scriptIntro", {
    sessionId,
    section: "intro",
    messages: [{ role: "system", content: prompt }],
  });
}

export async function generateMain(sessionId) {
  const articles = await fetchFeedArticles(process.env.FEED_URL || "");
  const prompt = getMainPrompt({ articles, targetDuration: 60 });

  // ✅ FIXED
  return await resilientRequest("scriptMain", {
    sessionId,
    section: "main",
    messages: [{ role: "system", content: prompt }],
  });
}

export async function generateOutro(sessionId) {
  const prompt = await getOutroPromptFull();

  // ✅ FIXED
  return await resilientRequest("scriptOutro", {
    sessionId,
    section: "outro",
    messages: [{ role: "system", content: prompt }],
  });
}

export async function generateComposedEpisode(sessionId) {
  const { intro, main, outro } = await getAllParts(sessionId);
  const fullTranscript = cleanTranscript(`${intro}

${main}

${outro}`);
  const chunks = chunkText(fullTranscript);

  // your R2 client already knows which bucket
  await putText(`transcript/${sessionId}.txt`, fullTranscript);
  await Promise.all(
    chunks.map((chunk, i) =>
      putText(`raw-text/${sessionId}/chunk_${i + 1}.txt`, chunk)
    )
  );

  const metadata = await generateEpisodeMeta({ intro, main, outro });
  await putJson(`meta/${sessionId}.json`, metadata);

  return { fullTranscript, chunks, metadata };
}
