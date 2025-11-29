// ==========================================================
// 🌐 Shared HTTP Client
// ----------------------------------------------------------
// Provides a robust fetch() wrapper with timeout support
// ==========================================================

import fetch from "node-fetch";

/**
 * Fetch with timeout guard
 * @param {string} url
 * @param {Object} [options]
 * @param {number} [options.timeout=15000] - milliseconds
 * @returns {Promise<Response>}
 */
export async function fetchWithTimeout(url, options = {}) {
  const { timeout = 15000, ...rest } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...rest, signal: controller.signal });
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

/**
 * Fetch text content from a URL safely.
 * Returns {ok:boolean, status:number, text:string|null}
 */
export async function fetchTextSafe(url, options = {}) {
  try {
    const resp = await fetchWithTimeout(url, options);
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, text };
  } catch (err) {
    return { ok: false, status: 0, text: null, error: err.message };
  }
}
