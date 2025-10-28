// services/script/utils/models.js

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { buildPrompt } from "./promptTemplates.js";
import { fetchFeedArticles } from "./fetchFeeds.js";

export async function generateIntro(sessionId, tone) {
  const prompt = buildPrompt("intro", { tone, sessionId });
  return await resilientRequest(prompt, { sessionId, section: "intro" });
}

export async function generateMain(sessionId, tone) {
  const feedData = await fetchFeedArticles(process.env.FEED_URL);
  const prompt = buildPrompt("main", { tone, feed: feedData, sessionId });
  return await resilientRequest(prompt, { sessionId, section: "main" });
}

export async function generateOutro(sessionId, tone) {
  const prompt = buildPrompt("outro", { tone, sessionId });
  return await resilientRequest(prompt, { sessionId, section: "outro" });
}
