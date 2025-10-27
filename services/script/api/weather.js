  // services/script/api/weather.js
import fetch from "node-fetch";
import { info, error } from "#logger.js";

export default async function handler(req, res) {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST || "weatherapi-com.p.rapidapi.com";

  if (!apiKey || !apiHost) {
    error("weather.api.missingCreds", { apiKey: !!apiKey, apiHost });
    return res
      .status(500)
      .json({ error: "Server missing RAPIDAPI credentials." });
  }

  const location = "London, England";

  try {
    const url = `https://${apiHost}/current.json?q=${encodeURIComponent(
      location
    )}`;

    info("weather.api.request", { url, apiHost });

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": apiHost,
        "x-rapidapi-key": apiKey,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      error("weather.api.fail", { status: response.status, text });
      return res
        .status(response.status)
        .json({ error: `Weather API failed`, text });
    }

    const data = await response.json();
    info("weather.api.success", {
      location: data?.location?.name,
      condition: data?.current?.condition?.text,
      temp: data?.current?.temp_c,
    });

    return res.status(200).json(data);
  } catch (err) {
    error("weather.api.catch", { err: err.message });
    return res.status(500).json({ error: err.message });
  }
                                 }
