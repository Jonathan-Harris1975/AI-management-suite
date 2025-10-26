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

  // ✅ Routing strategy
  routeModels: {
    intro: ["google", "chatgpt", "meta"],
    main: ["google", "chatgpt", "deepseek"],
    outro: ["google", "chatgpt", "meta"],

    // 🧩 Compose step (used in orchestration)
    compose: ["deepseek", "anthropic", "google"],

    // 🧠 Metadata route — required for title/description/SEO/artwork generation
    metadata: ["google", "chatgpt", "deepseek"],

    // 🧩 Podcast helper (meta info, tone, etc.)
    podcastHelper: ["deepseek", "anthropic", "google"],

    // ✅ RSS rewriting route
    rssRewrite: ["chatgpt", "google", "meta"],
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
