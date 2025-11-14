// ============================================================
// 🖼️ Podcast Artwork Generator (OpenRouter Image Model)
// ============================================================
//
// Uses the dedicated ART model + API key.
// This runs separately from the main ai-service.js model routing.
// ============================================================

import OpenAI from "openai";
import { warn, error } from "#logger.js";

// ------------------------------------------------------------
// 🔍 Required Environment Variables
// ------------------------------------------------------------
const REQUIRED = [
  "OPENROUTER_API_KEY_ART",
  "OPENROUTER_ART"  // model name for image generation
];

const missing = REQUIRED.filter(k => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  // Do NOT crash the entire suite — warn and disable artwork generation.
  warn("⚠️ Artwork generator missing required environment variables", { missing });
}

// ------------------------------------------------------------
// ⚙️ Config
// ------------------------------------------------------------
const cfg = {
  key: process.env.OPENROUTER_API_KEY_ART || "",
  baseURL: "https://openrouter.ai/api/v1",
  model: process.env.OPENROUTER_ART || "google/gemini-2.5-flash-image-preview:exp",
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
              type: "text",
              text: `Create a 1400x1400 podcast cover art image. 
                     Style: vibrant, futuristic, eye-catching. 
                     Theme: "${prompt}". 
                     Do NOT include any text.`,
            },
          ],
        },
      ],
      max_tokens: 2048,
    });

    // Newer OpenRouter image models respond with images[]
    const images = result.choices?.[0]?.message?.images;
    if (Array.isArray(images) && images[0]?.image_url?.url) {
      const url = images[0].image_url.url;
      if (url.startsWith("data:image/png;base64,")) {
        return url.split(",")[1]; // return base64 only
      }
    }

    // Fallback: check content array for image objects
    const content = result.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      const imageItem = content.find(i => i.type === "image" && i.image_url?.url);
      const url = imageItem?.image_url?.url;
      if (url && url.startsWith("data:image/png;base64,")) {
        return url.split(",")[1];
      }
    }

    // Fallback: regex search
    const raw = JSON.stringify(result);
    const match = raw.match(/data:image\/png;base64,([^"]+)/);
    if (match) return match[1];

    throw new Error("No image data found in OpenRouter response.");

  } catch (e) {
    error("Artwork generation error", { error: e?.message || e });
    throw new Error(`Failed to generate artwork: ${e.message}`);
  }
      }
