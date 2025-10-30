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
    podcastHelper: ["chatgpt", "google"],

    // ✅ Added aliases for orchestration keys
    scriptIntro: ["google", "chatgpt", "meta"],
    scriptMain: ["google", "chatgpt", "deepseek"],
    scriptOutro: ["google", "chatgpt", "meta"],
  },
};

export default aiConfig;
