// ai-service.js — minimal resilient requester, root-logger ready
import log from "../../../utils/root-logger.js";
import aiConfig from "./ai-config.js";
import fetch from "node-fetch";

const OPENROUTER_BASE =
  process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1";
const ENDPOINT = `${OPENROUTER_BASE}/chat/completions`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function resilientRequest(
  routeName,
  { messages } = {},
) {
  const chain = aiConfig.routeModels[routeName] || [];
  let lastErr;

  for (const providerId of chain) {
    const provider = aiConfig.models[providerId];
    if (!provider) continue;

    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${provider.apiKey}`,
        },
        body: JSON.stringify({
          model: provider.name,
          messages,
        }),
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      const json = await res.json();
      return json?.choices?.[0]?.message?.content || "";
    } catch (err) {
      lastErr = err;
      await sleep(300);
    }
  }

  log.error("ai.resilient.failed", { routeName });
  throw lastErr || new Error("all providers failed");
}

export default { resilientRequest };
