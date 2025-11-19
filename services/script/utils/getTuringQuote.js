// services/script/utils/getTuringQuote.js
/**
 * Retrieves a random Alan Turing quote from the local data file.
 * Uses an in-memory cache for performance.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { info, error,debug} from "#logger.js";

let quotesCache = null;

// Resolve the file location regardless of where it's imported from
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUOTES_PATH = path.resolve(__dirname, "../data/turing-quotes.txt");

export async function getTuringQuote() {
  try {
    // ✅ Serve from memory cache if available
    if (quotesCache && quotesCache.length > 0) {
      return quotesCache[Math.floor(Math.random() * quotesCache.length)];
    }

    info ("turingQuote.load")
    debug("turingQuote.load", { file: QUOTES_PATH });

    // ✅ Read from local text file
    const fileData = await fs.readFile(QUOTES_PATH, "utf-8");

    // Split into lines, remove blanks
    const quotes = fileData
      .split(/\r?\n/)
      .map((q) => q.trim())
      .filter((q) => q.length > 0);

    if (quotes.length === 0) {
      throw new Error("No quotes found in file");
    }

    // Cache for future calls
    quotesCache = quotes;

    // Pick one at random
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    return quote;
  } catch (err) {
    error("turingQuote.fail", { err: err.message });

    // ✅ Fallback static quote
    return "We can only see a short distance ahead, but we can see plenty there that needs to be done.";
  }
}

export default getTuringQuote;
