// shared/utils/ai-config.js

/**
 * AI Configuration Module
 * Manages AI model configurations and routing for different content generation tasks
 * @module ai-config
 */

/**
 * Validates that required environment variables are set
 * @throws {Error} If required environment variables are missing
 */
const validateEnvironment = () => {
  const requiredEnvVars = [
    'OPENROUTER_GOOGLE',
    'OPENROUTER_API_KEY_GOOGLE',
    'OPENROUTER_CHATGPT',
    'OPENROUTER_API_KEY_CHATGPT',
    'OPENROUTER_DEEPSEEK',
    'OPENROUTER_API_KEY_DEEPSEEK',
    'OPENROUTER_ANTHROPIC',
    'OPENROUTER_API_KEY_ANTHROPIC',
    'OPENROUTER_META',
    'OPENROUTER_API_KEY_META',
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}\n` +
      'Please check your .env file and ensure all AI model configurations are set.'
    );
  }
};

// Validate environment on module load
validateEnvironment();

/**
 * AI Model Configuration
 * @typedef {Object} ModelConfig
 * @property {string} name - Model name/identifier
 * @property {string} apiKey - API key for the model
 */

/**
 * Route Model Configuration
 * @typedef {Object} RouteConfig
 * @property {string} [mode] - Operation mode (e.g., 'chat')
 * @property {string[]} models - Array of model identifiers to use
 * @property {number} [maxTokens] - Maximum tokens for generation
 * @property {number} temperature - Temperature setting for generation (0-1)
 */

const aiConfig = {
  /**
   * Available AI Models
   * @type {Object.<string, ModelConfig>}
   */
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

  /**
   * Route-specific model configurations
   * @type {Object.<string, RouteConfig>}
   */
  routeModels: {
    rssRewrite: {
      mode: "chat",
      models: ["chatgpt", "google", "meta"],
      maxTokens: 1600,
      temperature: 0.7,
    },
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
      // Long-form content stitching with higher coherence
      models: ["anthropic", "chatgpt", "google"],
      temperature: 0.6,
    },
    metadata: {
      // Title, description, SEO, artwork prompts generation
      models: ["deepseek", "anthropic", "google"],
      temperature: 0.5,
    },
  },

  /**
   * Get model configuration by identifier
   * @param {string} modelId - Model identifier (e.g., 'google', 'chatgpt')
   * @returns {ModelConfig} Model configuration object
   * @throws {Error} If model identifier is not found
   */
  getModel(modelId) {
    if (!this.models[modelId]) {
      throw new Error(
        `Model '${modelId}' not found. Available models: ${Object.keys(this.models).join(', ')}`
      );
    }
    return this.models[modelId];
  },

  /**
   * Get route configuration by route name
   * @param {string} routeName - Route name (e.g., 'rssRewrite', 'intro')
   * @returns {RouteConfig} Route configuration object
   * @throws {Error} If route name is not found
   */
  getRouteConfig(routeName) {
    if (!this.routeModels[routeName]) {
      throw new Error(
        `Route '${routeName}' not found. Available routes: ${Object.keys(this.routeModels).join(', ')}`
      );
    }
    return this.routeModels[routeName];
  },

  /**
   * Get all models configured for a specific route
   * @param {string} routeName - Route name
   * @returns {ModelConfig[]} Array of model configurations
   */
  getModelsForRoute(routeName) {
    const routeConfig = this.getRouteConfig(routeName);
    return routeConfig.models.map(modelId => this.getModel(modelId));
  },

  /**
   * Validate that all models in route configurations exist
   * @throws {Error} If any route references a non-existent model
   */
  validateRouteModels() {
    const availableModels = Object.keys(this.models);
    
    for (const [routeName, config] of Object.entries(this.routeModels)) {
      for (const modelId of config.models) {
        if (!availableModels.includes(modelId)) {
          throw new Error(
            `Route '${routeName}' references non-existent model '${modelId}'`
          );
        }
      }
    }
  },
};

// Validate route models on initialization
aiConfig.validateRouteModels();

export default aiConfig;
