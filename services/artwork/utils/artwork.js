// utils/artwork.js
import OpenAI from "openai";

const cfg = {
  key: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-image-preview",
};

if (!cfg.key) {
  console.error("❌ Missing OPENROUTER_API_KEY");
  process.exit(1);
}

const client = new OpenAI({ apiKey: cfg.key, baseURL: cfg.baseURL });

export async function generatePodcastArtwork(prompt) {
  const result = await client.chat.completions.create({
    model: cfg.model,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Create a podcast cover art image, 1400x1400 pixels. Style: vibrant, modern, eye-catching. Theme: \"${prompt}\". Do not include any text.`,
          },
        ],
      },
    ],
    max_tokens: 2048,
  });

  // Primary location (OpenRouter images array)
  const images = result.choices?.[0]?.message?.images;
  if (Array.isArray(images) && images.length) {
    const dataUrl = images[0]?.image_url?.url;
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,")) {
      return dataUrl.split(",")[1];
    }
  }

  // Fallback: content array
  const content = result.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const dataUrl = content[0]?.image_url?.url;
    if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,")) {
      return dataUrl.split(",")[1];
    }
  }

  throw new Error("No image data found in OpenRouter response");
        }
