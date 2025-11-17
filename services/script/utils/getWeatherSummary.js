import scriptLogger from "./script-logger.js";
const { info, warn, error, debug } = scriptLogger;
import fetch from "node-fetch";

// services/script/utils/getWeatherSummary.js
// Returns a short, temperature-free weather line such as:
//   "light rain in London"
// If the API fails, returns a stable, safe fallback.
export async function getWeatherSummary() {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || "weatherapi-com.p.rapidapi.com";
  const location = "London";

  try {
    if (!apiKey) {
      warn("weather.missingApiKey", { location });
      return "grey skies in London";
    }

    info("weather.fetch.start", { location, apiHost });

    const url = `https://${apiHost}/current.json?q=${encodeURIComponent(location)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-key": apiKey,
        "x-rapidapi-host": apiHost,
      },
    });

    if (!res.ok) {
      throw new Error(`Weather fetch failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const condition = (data?.current?.condition?.text || "overcast").toLowerCase().trim();
    const summary = `${condition} in ${location}`;

    info("weather.summary", { summary, location });
    return summary;
  } catch (err) {
    error("weather.fetch.error", { location, err: String(err) });
    return "grey skies in London";
  }
}

export default getWeatherSummary;
