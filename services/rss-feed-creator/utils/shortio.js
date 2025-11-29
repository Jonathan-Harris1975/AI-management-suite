import fetch from 'node-fetch';

const API_KEY = process.env.SHORTIO_API_KEY;
const DOMAIN = process.env.SHORTIO_DOMAIN;

export async function shortenUrl(originalURL) {
  if (!API_KEY || !DOMAIN || !originalURL) return originalURL;
  const res = await fetch('https://api.short.io/links', {
    method: 'POST',
    headers: { Authorization: API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: DOMAIN, originalURL }),
  });
  if (!res.ok) return originalURL;
  const data = await res.json().catch(() => ({}));
  return data?.shortURL || originalURL;
}
