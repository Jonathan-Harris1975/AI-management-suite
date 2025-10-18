// utils/ai-service.js
import { OpenAI } from 'openai';
import { aiConfig } from './ai-config.js';

/**
 * Makes a resilient API call to OpenRouter, trying a sequence of models
 * with their corresponding API keys.
 *
 * @param {string} routeName - The name of the route (e.g., 'intro', 'compose').
 * @param {Array<object>} messages - The array of messages for the chat completion.
 * @returns {Promise<string>} - The content of the AI's response.
 * @throws {Error} - If all models in the sequence fail.
 */
export async function resilientRequest(routeName, messages) {
  const modelSequence = aiConfig.routeModels[routeName];
  if (!modelSequence) {
    throw new Error(`No model route defined for: ${routeName}`);
  }

  let lastError = null;

  // Iterate through the defined model sequence (e.g., ['chatgpt', 'deepseek', 'meta'])
  for (const modelKey of modelSequence) {
    const modelConfig = aiConfig.models[modelKey];

    // Validate that the model and its API key are configured
    if (!modelConfig || !modelConfig.name) {
      console.warn(`⚠️ Model key '${modelKey}' is not fully configured in ai-config. Skipping.`);
      continue;
    }
    if (!modelConfig.apiKey) {
      console.warn(`⚠️ API key for model '${modelKey}' is not set. Skipping.`);
      continue;
    }

    try {
      // --- FIX: Initialize the client *inside* the loop with the correct API key ---
      const openai = new OpenAI({
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: modelConfig.apiKey, // Use the specific key for this model
        defaultHeaders: aiConfig.headers,
      });
      // --- END FIX ---

      console.log(`🚀 Attempting API call with model: ${modelConfig.name}`);
      const completion = await openai.chat.completions.create({
        model: modelConfig.name,
        messages: messages,
        ...aiConfig.commonParams,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content || !content.trim()) {
        throw new Error("Empty response from model.");
      }

      console.log(`✅ Success with model: ${modelConfig.name}`);
      return content; // Success, return the result immediately

    } catch (error) {
      console.error(`❌ Failed with model ${modelConfig.name}:`, error.message);
      lastError = error; // Save the error and try the next model
    }
  }

  // If all models in the sequence have failed
  throw new Error(`All models failed for route '${routeName}'. Last error: ${lastError?.message}`);
}
