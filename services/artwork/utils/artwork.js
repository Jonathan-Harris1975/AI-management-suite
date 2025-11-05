// utils/artwork.js
import OpenAI from "openai";

// Validate environment first
const requiredEnv = ['OPENROUTER_API_KEY'];
const missing = requiredEnv.filter(key => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const cfg = {
  key: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
  model: process.env.OPENROUTER_ART || "google/gemini-2.5-flash-image-preview:exp",
};

const client = new OpenAI({ 
  apiKey: cfg.key, 
  baseURL: cfg.baseURL 
});

export async function generatePodcastArtwork(prompt) {
  try {
    const result = await client.chat.completions.create({
      model: cfg.model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Create a podcast cover art image, 1400x1400 pixels. Style: vibrant, modern, eye-catching. Theme: "${prompt}". Do not include any text.`,
            },
          ],
        },
      ],
      max_tokens: 2048,
    });

    // Check multiple possible response structures
    const images = result.choices?.[0]?.message?.images;
    if (Array.isArray(images) && images.length > 0) {
      const dataUrl = images[0]?.image_url?.url;
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,")) {
        return dataUrl.split(",")[1];
      }
    }

    // Fallback: content array
    const content = result.choices?.[0]?.message?.content;
    if (Array.isArray(content)) {
      const imageContent = content.find(item => item.type === "image");
      const dataUrl = imageContent?.image_url?.url;
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,")) {
        return dataUrl.split(",")[1];
      }
    }

    // Final fallback: check for direct base64 in response
    if (result.choices?.[0]?.message?.content?.includes("base64")) {
      const match = result.choices[0].message.content.match(/data:image\/png;base64,([^"]+)/);
      if (match) return match[1];
    }

    throw new Error("No image data found in OpenRouter response structure");
  } catch (error) {
    console.error("Artwork generation error:", error);
    throw new Error(`Failed to generate artwork: ${error.message}`);
  }
}
