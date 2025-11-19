// services/script/utils/getWeatherSummary.js
import fetch from "node-fetch";
import { info, error , debug} from "#logger.js";

/**
 * Returns a short, temperature-free weather line such as:
 *   "light rain in London"
 * If the API fails, returns a stable, safe fallback.
 */
export async function getWeatherSummary() {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || "weatherapi-com.p.rapidapi.com";
  const location = "London";

  try {
    if (!apiKey) throw new Error("Missing RAPIDAPI_KEY");

    const url = `https://${apiHost}/current.json?q=${encodeURIComponent(location)}`;
    debug("Fetching weather data");

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost,
      },
    });

    if (!res.ok) throw new Error(`Weather fetch failed: ${res.status} ${res.statusText}`);
    const data = await res.json();

    const condition = (data?.current?.condition?.text || "overcast").toLowerCase().trim();
    const summary = `${condition} in London`;
    info("🌤️ Weather summary fetch successfully");
    debug("Weather summary: ${summary}");
    return summary;
  } catch (err) {
    error("Failed to get weather summary");
    return "grey skies in London";
  }
}

export default getWeatherSummary;
