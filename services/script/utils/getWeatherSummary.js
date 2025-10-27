// services/script/utils/getWeatherSummary.js
import fetch from "node-fetch";
import { info, error } from "#logger.js";

export async function getWeatherSummary() {
  const endpoint = "http://localhost:3000/api/weather";
  info("weather.fetch.internal", { endpoint });

  try {
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`Weather endpoint ${res.status}`);
    const data = await res.json();
    const condition = data?.current?.condition?.text || "cloudy";
    const temp = data?.current?.temp_c ?? 13;
    const summary = `${condition.toLowerCase()} and ${temp}°C in London`;
    info("weather.summary.success", { summary });
    return summary;
  } catch (err) {
    error("weather.summary.fail", { err: err.message });
    // 🔒 fallback string so prompt never empty
    return "overcast and mildly damp — a perfectly average London morning";
  }
}
