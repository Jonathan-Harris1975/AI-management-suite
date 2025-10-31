// utils/ai-config.js
/**
 * Centralized configuration for OpenRouter models and routing.
 * Uses production-ready, low-cost models for performance and reliability.
 */
export const aiConfig = {
  models: {
    google: {
      name: process.env.OPENROUTER_GOOGLE,
      apiKey: process.env.OPENROUTER_API_KEY_GOOGLE,
    },
    chatgpt: {
      name: process.env.OPENROUTER_CHATGPT,
      apiKey: process.env.OPENROUTER_API_KEY_CHATGPT,
    },
    deepseek: {
      name: process.env.OPENROUTER_DEEPSEEK,
      apiKey: process.env.OPENROUTER_API_KEY_DEEPSEEK,
    },
    anthropic: {
      name: process.env.OPENROUTER_ANTHROPIC,
      apiKey: process.env.OPENROUTER_API_KEY_ANTHROPIC,
    },
    meta: {
      name: process.env.OPENROUTER_META,
      apiKey: process.env.OPENROUTER_API_KEY_META,
    },
  },

  // ✅ Routing strategy for AI Podcast Suite + RSS Feed Creator
  routeModels: {
    // --- Podcast generation routes ---
    intro: ["google", "chatgpt", "meta"],
    main: ["google", "chatgpt", "deepseek"],
    outro: ["google", "chatgpt", "meta"],
    scriptIntro: ["google", "chatgpt", "meta"],
    scriptMain: ["google", "chatgpt", "deepseek"],
    scriptOutro: ["google", "chatgpt", "meta"],

    // --- Composition & metadata ---
    compose: ["deepseek", "anthropic", "google"],
    metadata: ["google", "chatgpt", "deepseek"],
    podcastHelper: ["deepseek", "anthropic", "google"],

    // --- RSS feed routes ---
    rssRewrite: ["chatgpt", "google", "meta"],       // 🧠 AI article rewrite
    rssShortTitle: ["chatgpt", "google", "meta"],    // ✅ Added short title generation
  },

  commonParams: {
    temperature: 0.75,
    timeout: 45000,
  },

  headers: {
    "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
    "X-Title": process.env.APP_TITLE || "Podcast Script Generation",
  },
};

export default aiConfig;
