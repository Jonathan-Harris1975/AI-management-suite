// API/weather.js

export default async function handler(request, response) {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST;

  if (!apiKey || !apiHost) {
    return response.status(500).json({ error: "Server is not configured with API credentials." });
  }

  // Force location to London, UK
  const location = "London";

  // Use today’s date in YYYY-MM-DD format
  const today = new Date().toISOString().split("T")[0];

  try {
    const url = `https://${apiHost}/history.json?q=${encodeURIComponent(location)}&dt=${today}`;

    const weatherResponse = await fetch(url, {
      method: "GET",
      headers: {
        "x-rapidapi-host": "weatherapi-com.p.rapidapi.com",
        "x-rapidapi-key": apiKey,
      },
    });

    if (!weatherResponse.ok) {
      return response.status(weatherResponse.status).json({ error: "Weather API request failed" });
    }

    const data = await weatherResponse.json();
    return response.status(200).json(data);

  } catch (error) {
    return response.status(500).json({ error: "Weather API call failed", details: error.message });
  }
}
