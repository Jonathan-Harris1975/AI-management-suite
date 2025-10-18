import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "#shared/r2-client.js";
// utils/artwork.js
import OpenAI from "openai";

// Config for OpenRouter
const cfg = {
  key: process.env.OPENROUTER_API_KEY_ART,
  model: "google/gemini-2.5-flash-image-preview",
  baseURL: "https://openrouter.ai/api/v1",
};

if (!cfg.key) {
  console.error("❌ Missing OPENROUTER_API_KEY");
  process.exit(1);
}

const openrouter = new OpenAI({
  apiKey: cfg.key,
  baseURL: cfg.baseURL,
});

/**
 * Generate artwork via OpenRouter.
 * @param {string} prompt - Artwork description
 * @returns {Promise<string>} Base64 PNG string
 */
export async function generateArtwork(prompt) {
  console.log(`🖌️ Sending prompt to OpenRouter: "${prompt}"`);

  const result = await openrouter.chat.completions.create({
    model: cfg.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Create a podcast cover art image, 1400x1400 pixels. 
                   Style: vibrant, modern, and eye-catching. 
                   Theme: "${prompt}". 
                   Do not include any text.`,
          },
        ],
      },
    ],
    max_tokens: 2048,
  });

  // Primary: choices[0].message.images
  const images = result.choices[0]?.message?.images;
  if (images && Array.isArray(images) && images.length > 0) {
    const imageUrlData = images[0]?.image_url?.url;
    if (imageUrlData?.startsWith("data:image/png;base64,")) {
      return imageUrlData.split(",")[1];
    }
  }

  // Fallback: check message.content
  const content = result.choices[0]?.message?.content;
  if (content && Array.isArray(content) && content[0]?.image_url?.url) {
    const imageUrlData = content[0].image_url.url;
    if (imageUrlData.startsWith("data:image/png;base64,")) {
      return imageUrlData.split(",")[1];
    }
  }

  console.error("❌ No valid image data in OpenRouter response:", JSON.stringify(result, null, 2));
  throw new Error("Failed to generate artwork image from OpenRouter");
      }
