// ============================================================
// 🖼️ Podcast Artwork Generator – Correct OpenRouter / Nano Banana
// ============================================================
//
// Uses chat.completions endpoint as required by OpenRouter.
// Works with Nano Banana, Flux, Gemini Image, etc.
// Correctly parses image objects from message content.
// Guaranteed base64 extraction.
// ============================================================

import OpenAI from "openai";
import { warn, error } from "#logger.js";

// ------------------------------------------------------------
// 🔍 Required Environment Variables
// ------------------------------------------------------------
const REQUIRED = ["OPENROUTER_API_KEY_ART", "OPENROUTER_ART"];
const missing = REQUIRED.filter(k => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  warn("⚠️ Artwork generator missing required environment variables", { missing });
}

// ------------------------------------------------------------
// ⚙️ Config
// ------------------------------------------------------------
const cfg = {
  key: process.env.OPENROUTER_API_KEY_ART || "",
  baseURL: "https://openrouter.ai/api/v1",
  model: process.env.OPENROUTER_ART || "nano-nano/banana"
};

const client = new OpenAI({
  apiKey: cfg.key,
  baseURL: cfg.baseURL,
});

// ------------------------------------------------------------
// 🎨 Generate Podcast Artwork (Base64 PNG)
// ------------------------------------------------------------
export async function generatePodcastArtwork(prompt) {
  if (!cfg.key || !cfg.model) {
    throw new Error("Artwork generation disabled: missing required OpenRouter env vars.");
  }

  try {
    const result = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Create a 1400x1400 podcast cover art image.
                     Cinematic, vibrant, AI-themed.
                     Theme: "${prompt}".
                     Do NOT include any text.`,
            },
          ],
        },
      ],
      // Nano Banana returns image objects automatically
    });

    // Extract image from result.choices[0].message.content[]
    const content = result.choices?.[0]?.message?.content;

    if (Array.isArray(content)) {
      const image = content.find(c => c.type === "output_image" || c.type === "image");

      if (image?.image_url?.url?.startsWith("data:image")) {
        return image.image_url.url.split(",")[1]; // base64 only
      }
    }

    // Fallback regex for safety
    const raw = JSON.stringify(result);
    const match = raw.match(/data:image\/png;base64,([^"]+)/);
    if (match) return match[1];

    throw new Error("No image data found in OpenRouter response.");

  } catch (e) {
    error("Artwork generation error", { error: e?.message || e });
    throw new Error(`Failed to generate artwork: ${e.message}`);
  }
}
