import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import { generateText } from "./ai.js";

export async function editScript({ transcript, editorPrompt }) {
  if (!editorPrompt) return transcript;
  const system =
    "You are a precise editorial assistant for a podcast script. Keep structure coherent and improve clarity/tone per instructions.";
  const prompt = `Here is the current podcast script. Please rewrite/adjust it based on the instruction below while preserving the factual points and structure.

Instruction: ${editorPrompt}

---BEGIN SCRIPT---
${transcript}
---END SCRIPT---

Return only the revised script, no commentary.`;

  return generateText({ system, prompt });
}
