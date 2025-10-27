// services/script/routes/weatherRoute.js
import express from "express";
import fetch from "node-fetch";
import { info, error } from "#logger.js";

const router = express.Router();

router.get("/weather", async (req, res) => {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST;

  if (!apiKey || !apiHost) {
    error("weather.api.missingCredentials");
    return res.status(500).json({ error: "Missing weather API credentials" });
  }

  const location = "London, England";
  const url = `https://${apiHost}/current.json?q=${encodeURIComponent(location)}`;

  try {
    info("weather.api.call", { url });

    const weatherResponse = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": apiHost,
        "x-rapidapi-key": apiKey,
      },
    });

    if (!weatherResponse.ok)
      throw new Error(`Weather API returned ${weatherResponse.status}`);

    const data = await weatherResponse.json();
    return res.status(200).json(data);
  } catch (err) {
    error("weather.api.fail", { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

export default router;
