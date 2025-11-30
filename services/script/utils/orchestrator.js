// services/script/utils/orchestrator.js

import { info, error } from "#logger.js";
import {
  generateComposedEpisodeParts,
} from "./models.js";

import { fetchWeatherSummary } from "../../shared/utils/weather.js";
import { getTuringQuote } from "./turingQuote.js";
import getSponsor from "./getSponsor.js";
import { fetchArticles } from "./rss-feed.js";

export async function orchestrateEpisode(input = {}) {
  const sessionId = input.sessionId;
  const date = input.date || new Date().toISOString();
  const topic = input.topic || "AI Weekly";
  const tone = input.tone || 2.5;

  info("script.orchestrate.start", { sessionId });

  // Fetch context data
  const weatherSummary = await fetchWeatherSummary();
  const turingQuote = await getTuringQuote();
  const articles = await fetchArticles();

  const sponsorBook = getSponsor();

  const ctx = {
    sessionId,
    date,
    topic,
    tone,
    weatherSummary,
    turingQuote,
    articles,
    sponsorBook,
  };

  // Generate
  const episode = await generateComposedEpisodeParts(ctx);

  info("script.orchestrate.complete", {
    sessionId,
    transcriptKey: `${sessionId}.txt`,
    metaKey: `${sessionId}.json`,
  });

  return {
    ok: true,
    sessionId,
    ...episode,
  };
    }
