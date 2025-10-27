// services/script/utils/weather.js
/**
 * Fetches weather summary from the internal API/weather endpoint.
 * Uses fallback text if the endpoint or API fails.
 */

import fetch from "node-fetch";
import { info, error } from "#logger.js";

export async function getWeatherSummary() {
  try {
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const endpoint = `${baseUrl}/api/weather`;

    info("weather.fetch.internal", { endpoint });

    const res = await fetch(endpoint, { timeout: 8000 });
    if (!res.ok) throw new Error(`Weather endpoint ${res.status}`);

    const data = await res.json();
    const condition = data?.current?.condition?.text || "grey skies";
    const temp = data?.current?.temp_c ?? null;

    const summary = temp
      ? `${condition.toLowerCase()} in London, around ${Math.round(temp)}°C`
      : `${condition.toLowerCase()} in London`;

    return summary;
  } catch (err) {
    error("weather.summary.fail", { err: err.message });
    return "grey drizzle and unpredictable skies over London";
  }
}

export default getWeatherSummary;
