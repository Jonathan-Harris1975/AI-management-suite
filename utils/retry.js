// utils/retry.js
import { warn, error } from "#logger.js";

/**
 * Core retry handler.
 * @param {Function} fn - Function to execute (must return a Promise)
 * @param {Object} options - Retry configuration
 * @param {number} [options.retries=3] - Max retry attempts
 * @param {number} [options.delay=1000] - Initial delay in ms
 * @param {number} [options.factor=2] - Backoff multiplier
 * @param {string} [options.context='retry'] - Context for logs
 * @returns {Promise<*>}
 */
export async function retry(fn, {
  retries = 3,
  delay = 1000,
  factor = 2,
  context = "retry",
} = {}) {
  if (typeof fn !== "function") {
    const msg = `❌ Invalid argument passed to retry(): expected function, got ${typeof fn}`;
    error({ context }, msg);
    throw new TypeError(msg);
  }

  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt < retries) {
        warn(
          { context, attempt, retries, err: err?.message },
          `↻ Retrying (${attempt}/${retries}) after ${delay}ms...`
        );
        await new Promise((res) => setTimeout(res, delay));
        delay *= factor;
      } else {
        error({ context, err: err?.message }, "💥 All retries failed");
        throw err;
      }
    }
  }
}

/**
 * Alias for backward compatibility — used in ttsProcessor and others.
 */
export const withRetries = retry;
export default retry;
