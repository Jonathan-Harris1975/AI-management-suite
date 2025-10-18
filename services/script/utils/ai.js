import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/ai.js

function safeJsonParse(aiResponse) {
  let parsed;

  try {
    // First attempt: normal parse
    parsed = JSON.parse(aiResponse);
  } catch (err) {
    console.error("❌ Failed to parse AI title/description JSON:", err);

    // Try to extract JSON object if response has extra text
    const match = aiResponse.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e) {
        console.error("❌ Still failed after extracting JSON:", e);
        parsed = { title: "Untitled", description: aiResponse };
      }
    } else {
      parsed = { title: "Untitled", description: aiResponse };
    }
  }

  return parsed;
}

export {
  // ... your other exports
  safeJsonParse,
};
