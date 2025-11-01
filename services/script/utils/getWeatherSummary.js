// services/script/utils/getWeatherSummary.js
import fetch from "node-fetch";
import { info, error } from "#logger.js";

export async function getWeatherSummary() {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || "weatherapi-com.p.rapidapi.com";
  const location = "London";

  try {
    if (!apiKey) throw new Error("Missing RAPIDAPI_KEY");

    const url = `https://${apiHost}/current.json?q=${encodeURIComponent(location)}`;
    info("weather.fetch.external", { url, host: apiHost });

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": apiHost,
        "x-rapidapi-key": apiKey,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Weather API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const condition = data?.current?.condition?.text || "cloudy";
    const temp = data?.current?.temp_c ?? 13;

    const summary = `${condition.toLowerCase()} and ${temp}°C in London`;
    info("weather.summary.success", { summary });
    return summary;
  } catch (err) {
    error("weather.summary.fail", { err: err.message });

    // ✅ Never break the intro again
    return "dreary grey skies and a hint of drizzle — classic London weather";
  }
}
