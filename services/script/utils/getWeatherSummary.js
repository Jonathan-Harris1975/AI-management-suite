// services/script/utils/getWeatherSummary.js
import { info, error } from "#logger.js";

/**
 * Fetches the current weather summary from the internal weather endpoint.
 * Falls back to a default description if the API or network fails.
 */
export async function getWeatherSummary() {
  const endpoint = "http://localhost:3000/api/weather";

  try {
    info("weather.fetch.internal", { endpoint });

    const res = await fetch(endpoint, { method: "GET" });

    if (!res.ok) {
      throw new Error(`Weather endpoint ${res.status}`);
    }

    const data = await res.json();

    if (!data || !data.current || !data.location) {
      throw new Error("Invalid weather data structure");
    }

    const condition = data.current.condition?.text || "unavailable";
    const temp = `${Math.round(data.current.temp_c)}°C`;
    const location = data.location?.name || "London";

    const summary = `${condition.toLowerCase()} and ${temp} in ${location}`;

    info("weather.summary.success", { summary });
    return summary;
  } catch (err) {
    error("weather.summary.fail", { err: err.message });

    // ✅ Fallback message to keep podcast intro running
    return "dreary grey skies over London — typical British weather";
  }
}

export default getWeatherSummary;
