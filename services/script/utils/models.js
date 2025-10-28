// services/script/utils/models.js

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { getIntroPrompt, getMainPrompt, getOutroPromptFull } from "./promptTemplates.js";
import { fetchFeedArticles } from "./fetchFeeds.js";
import { putText, putJson } from "../../shared/utils/r2-client.js";
import { cleanTranscript } from "./textHelpers.js";
import chunkText from "./chunkText.js";
import { generateEpisodeMeta } from "./podcastHelpers.js";
import sessionCache from "./sessionCache.js";

export async function generateIntro(sessionId) {
  const weatherSummary = "Overcast and drizzly â€” perfect AI podcast weather.";
  const turingQuote = "We can only see a short distance ahead, but we can see plenty there that needs to be done.";

  const prompt = getIntroPrompt({ weatherSummary, turingQuote });
  return await resilientRequest(prompt, { sessionId, section: "intro" });
}

export async function generateMain(sessionId) {
  const articles = await fetchFeedArticles(process.env.FEED_URL || "");
  const prompt = getMainPrompt({ articles, targetDuration: 60 });
  return await resilientRequest(prompt, { sessionId, section: "main" });
}

export async function generateOutro(sessionId) {
  const prompt = await getOutroPromptFull(); // async
  return await resilientRequest(prompt, { sessionId, section: "outro" });
}

export async function generateComposedEpisode(sessionId) {
  const { intro, main, outro } = await sessionCache.get(sessionId);

  const fullTranscript = cleanTranscript(`${intro}\n\n${main}\n\n${outro}`);
  const chunks = chunkText(fullTranscript);

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
