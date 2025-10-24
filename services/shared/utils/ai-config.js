// shared/utils/ai-config.js

const aiConfig = {
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

  routeModels: {
    intro: {
      models: ["google", "chatgpt", "meta"],
      temperature: 0.7,
    },
    main: {
      models: ["google", "chatgpt", "deepseek"],
      temperature: 0.7,
    },
    outro: {
      models: ["google", "chatgpt", "meta"],
      temperature: 0.7,
    },
    compose: {
      // compose is long-form stitching voice → higher coherence, less chaos
      models: ["anthropic", "chatgpt", "google"],
      temperature: 0.6,
    },
    metadata: {
      // metadata = title/description/seo/artwork prompts
      models: ["deepseek", "anthropic", "google"],
      temperature: 0.5,
    },
  },
};

export default aiConfig;
