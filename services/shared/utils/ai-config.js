// utils/ai-config.js
/**
 * Centralized configuration for OpenRouter models and routing.
 * This setup uses standard, low-cost pay-as-you-go models for reliability
 * and performance, avoiding the unreliable free tier.
 */
export const aiConfig = {
  models: {
    // Using the standard, reliable, and very low-cost Gemini Flash model.
    google: {
      name: process.env.OPENROUTER_GOOGLE,
      apiKey: process.env.OPENROUTER_API_KEY_GOOGLE,
    },
    // The standard GPT-4o Mini is a fast and powerful fallback.
    chatgpt: {
      name: process.env.OPENROUTER_CHATGPT,
      apiKey: process.env.OPENROUTER_API_KEY_CHATGPT,
    },
    // Standard Deepseek for reliable JSON generation.
    deepseek: {
      name: process.env.OPENROUTER_DEEPSEEK,
      apiKey: process.env.OPENROUTER_API_KEY_DEEPSEEK,
    },
    
    anthropic: {
      name: process.env.OPENROUTER_ANTHROPIC,
      apiKey: process.env.OPENROUTER_API_KEY_ANTHROPIC,
    },
    // Standard Llama 3 is a fast and cheap final fallback.
    meta: {
      name: process.env.OPENROUTER_META,
      apiKey: process.env.OPENROUTER_API_KEY_META,
    },
  },

  // Routing strategy remains the same, as it is logically sound.
  routeModels: {
  intro: ["google", "chatgpt", "meta"],
  main: ["google", "chatgpt", "deepseek"],
  outro: ["google", "chatgpt", "meta"],
  compose: ["deepseek", "anthropic", "google"],
  podcastHelper: ["deepseek", "anthropic", "google"],
  rssRewrite: ["chatgpt", "google", "meta"], // ✅ NEW ROUTE
},

  commonParams: {
    temperature: 0.75,
    timeout: 45000, // Increased to 45s to handle any potential "cold starts" on the paid models.
  },

  headers: {
    "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
    "X-Title": process.env.APP_TITLE || "Podcast Script Generation",
  }
};
