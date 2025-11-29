export const aiConfig = {
  models: {
    google:    { name: process.env.OPENROUTER_GOOGLE,    apiKey: process.env.OPENROUTER_API_KEY_GOOGLE },
    chatgpt:   { name: process.env.OPENROUTER_CHATGPT,   apiKey: process.env.OPENROUTER_API_KEY_CHATGPT },
    deepseek:  { name: process.env.OPENROUTER_DEEPSEEK,  apiKey: process.env.OPENROUTER_API_KEY_DEEPSEEK },
    anthropic: { name: process.env.OPENROUTER_ANTHROPIC, apiKey: process.env.OPENROUTER_API_KEY_ANTHROPIC },
    meta:      { name: process.env.OPENROUTER_META,      apiKey: process.env.OPENROUTER_API_KEY_META },
  },

  routeModels: {
    intro:        ["chatgpt", "google", "meta"],
    main:         ["google", "chatgpt", "deepseek"],
    outro:        ["chatgpt", "google", "meta"],   // UPDATED

    scriptIntro:  ["chatgpt", "google", "meta"],
    scriptMain:   ["google", "chatgpt", "deepseek"],
    scriptOutro:  ["chatgpt", "google", "meta"],   // UPDATED

    compose:      ["deepseek", "anthropic", "google"],

    editorialPass: ["chatgpt", "google", "meta"], // UPDATED
    editAndFormat: ["chatgpt", "google", "deepseek"],

    metadata:      ["google", "chatgpt", "deepseek"],
    podcastHelper: ["chatgpt", "google", "meta"],
    seoKeywords:   ["chatgpt", "google"],
    artworkPrompt: ["meta", "google"],
    rssRewrite:    ["chatgpt", "google", "meta"],
    rssShortTitle: ["chatgpt", "google", "meta"],
  },

  commonParams: { temperature: 0.75, timeout: 45000 },

  headers: {
    "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
    "X-Title": process.env.APP_TITLE || "Podcast Script Generation",
  },
};

export default aiConfig;
