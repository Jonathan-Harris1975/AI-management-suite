import fetch from "node-fetch";
import { info, error } from "#logger.js";

export async function fetchFeedsXml(urls = []) {
  const out = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: "follow", timeout: 30000 });
      if (!res.ok) {
        error("❌ HTTP error", { url, status: res.status });
        out.push({ ok: false, url, err: `HTTP ${res.status}` });
        continue;
      }
      const text = await res.text();
      out.push({ ok: true, url, xml: text });
    } catch (e) {
      error("💥 Fetch exception", { url, err: e.message });
      out.push({ ok: false, url, err: e.message });
    }
  }
  info("📥 Fetch complete", { total: out.length });
  return out;
}
