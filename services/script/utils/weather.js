import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// API/weather.js

export default async function handler(request, response) {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST;

  if (!apiKey || !apiHost) {
    return response.status(500).json({ error: "Server is not configured with API credentials." });
  }

  // Fixed location: London, England
  const location = "London, England";

  try {
    const url = `https://${apiHost}/current.json?q=${encodeURIComponent(location)}`;

    const weatherResponse = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "weatherapi-com.p.rapidapi.com",
        "x-rapidapi-key": apiKey,
      },
    });

    if (!weatherResponse.ok) {
      throw new Error("Weather API request failed.");
    }

    const weatherData = await weatherResponse.json();
    return response.status(200).json(weatherData);
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
