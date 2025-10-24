// shared/utils/ai-config.js
/**
 * Centralized configuration for OpenRouter model routing.
 * Uses environment-defined models and API keys for each vendor.
 * Ensures consistent, paid-tier reliability across all tasks.
 */

export const aiConfig = {
  // ─────────────────────────────────────────────
  // MODEL DEFINITIONS — All model names + API keys pulled from environment
  // ─────────────────────────────────────────────
  models: {
    google: {
      name: process.env.OPENROUTER_GOOGLE,              // e.g. "google/gemini-flash-1.5"
      apiKey: process.env.OPENROUTER_API_KEY_GOOGLE,
    },
    chatgpt: {
      name: process.env.OPENROUTER_CHATGPT,             // e.g. "openai/gpt-4o-mini"
      apiKey: process.env.OPENROUTER_API_KEY_CHATGPT,
    },
    deepseek: {
      name: process.env.OPENROUTER_DEEPSEEK,            // e.g. "deepseek/deepseek-coder"
      apiKey: process.env.OPENROUTER_API_KEY_DEEPSEEK,
    },
    anthropic: {
      name: process.env.OPENROUTER_ANTHROPIC,           // e.g. "anthropic/claude-3.5-sonnet"
      apiKey: process.env.OPENROUTER_API_KEY_ANTHROPIC,
    },
    meta: {
      name: process.env.OPENROUTER_META,                // e.g. "meta-llama/llama-3-70b"
      apiKey: process.env.OPENROUTER_API_KEY_META,
    },
  },

  // ─────────────────────────────────────────────
  // ROUTE DEFINITIONS — Logical task routes and model fallback chains
  // ─────────────────────────────────────────────
  routes: {
    // conversational / creative generation
    intro: {
      mode: "chat",
      models: ["google", "chatgpt", "meta"],
      maxTokens: 1200,
      temperature: 0.7,
    },
    main: {
      mode: "chat",
      models: ["google", "chatgpt", "deepseek"],
      maxTokens: 2000,
      temperature: 0.7,
    },
    outro: {
      mode: "chat",
      models: ["google", "chatgpt", "meta"],
      maxTokens: 1000,
      temperature: 0.65,
    },
    compose: {
      mode: "chat",
      models: ["deepseek", "anthropic", "google"],
      maxTokens: 2800,
      temperature: 0.6,
    },

    // utility metadata generation (prompt-based)
    metadata: {
      mode: "prompt",
      models: ["deepseek", "chatgpt", "google"],
      maxTokens: 600,
      temperature: 0.5,
    },

    // specialized support tasks
    podcastHelper: {
      mode: "chat",
      models: ["deepseek", "anthropic", "google"],
      maxTokens: 1800,
      temperature: 0.7,
    },
    rssRewrite: {
      mode: "chat",
      models: ["chatgpt", "google", "meta"],
      maxTokens: 1600,
      temperature: 0.7,
    },
  },

  // ─────────────────────────────────────────────
  // DEFAULTS
  // ─────────────────────────────────────────────
  commonParams: {
    temperature: 0.75,
    timeout: 45000, // 45s allows for OpenRouter cold starts
  },

  headers: {
    "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
    "X-Title": process.env.APP_TITLE || "AI Podcast Suite",
  },
};

export default aiConfig;
