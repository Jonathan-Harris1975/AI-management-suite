import scriptLogger from "./script-logger.js";
const { info, warn, error, debug } = scriptLogger;
// services/script/utils/getSponsor.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Load a random sponsor (book) from the local JSON file in services/script/data/books.json.
 * If missing, return a default.
 */
export default function getSponsor() {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // ✅ Correct relative path resolution
    const localPath = path.resolve(__dirname, "../data/books.json");

    if (!fs.existsSync(localPath)) {
      warn(`⚠️ books.json not found at ${localPath}`);
      return {
        title: "Digital Diagnosis: How AI Is Revolutionizing Healthcare",
        url: "https://jonathan-harris.online",
      };
    }

    const raw = fs.readFileSync(localPath, "utf-8");
    const books = JSON.parse(raw);

    if (!Array.isArray(books) || books.length === 0) {
      warn("⚠️ books.json is empty or malformed, returning fallback sponsor.");
      return {
        title: "Digital Diagnosis: How AI Is Revolutionizing Healthcare",
        url: "https://jonathan-harris.online",
      };
    }

    const randomBook = books[Math.floor(Math.random() * books.length)];
    info(`📘 Selected sponsor: ${randomBook.title}`);
    return randomBook;
  } catch (err) {
    error("❌ getSponsor() failed", { error: err });
    return {
      title: "Digital Diagnosis: How AI Is Revolutionizing Healthcare",
      url: "https://jonathan-harris.online",
    };
  }
}
