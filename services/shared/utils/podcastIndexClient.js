// services/shared/utils/podcastIndexClient.js
// ============================================================
// 🔗 Podcast Index API Client (HMAC-SHA1 auth)
// ============================================================
//
// Env vars:
//
//   API_KEY_PODCAST_INDEX     = your Podcast Index API key
//   API_SECRET_PODCAST_INDEX  = your Podcast Index API secret
//   PODCASTINDEX_USER_AGENT   = (optional) custom UA string
//
// Base URL: https://api.podcastindex.org/api/1.0
//
// Exposed helpers:
//   - getPodcastByFeedUrl(feedUrl)
//   - getEpisodesByFeedUrl(feedUrl, options?)
//   - searchPodcastsByTerm(term, options?)
//   - getTrendingPodcasts(options?)
//   - notifyHubByUrl(feedUrl)
//   - rawRequest(path, options?)
// ============================================================

import crypto from "node:crypto";
import { info, warn, error, debug } from "#logger.js";

// unifies logging interface expected by this module
const log = { info, warn, error, debug };

const API_BASE = "https://api.podcastindex.org/api/1.0";

const API_KEY = process.env.API_KEY_PODCAST_INDEX || "";
const API_SECRET = process.env.API_SECRET_PODCAST_INDEX || "";
const USER_AGENT =
  process.env.PODCASTINDEX_USER_AGENT ||
  "TuringTorch/1.0 (+https://jonathan-harris.online)";

function ensureConfig() {
  if (!API_KEY || !API_SECRET) {
    log.warn("podcastIndexClient: missing API key/secret", {
      hasKey: Boolean(API_KEY),
      hasSecret: Boolean(API_SECRET),
    });
  }
}

// ------------------------------------------------------------
// 🧮 HMAC-style auth header builder
// ------------------------------------------------------------
function buildAuthHeaders() {
  ensureConfig();

  const ts = Math.floor(Date.now() / 1000); // seconds since epoch
  const authString = `${API_KEY}${API_SECRET}${ts}`;
  const hash = crypto
    .createHash("sha1")
    .update(authString, "utf8")
    .digest("hex");

  return {
    "User-Agent": USER_AGENT,
    "X-Auth-Key": API_KEY,
    "X-Auth-Date": ts.toString(),
    Authorization: hash,
  };
}

// ------------------------------------------------------------
// 🌐 Core request helper
// ------------------------------------------------------------
async function podcastIndexRequest(path, options = {}) {
  const {
    query = {},
    method = "GET",
    body = null,
    timeoutMs = 8000,
  } = options;

  const url = new URL(`${API_BASE}${path}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    url.searchParams.set(key, String(value));
  });

  const headers = buildAuthHeaders();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  log.debug("podcastIndex.request", {
    method,
    url: url.toString(),
  });

  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    let json = null;

    if (text) {
      try {
        json = JSON.parse(text);
      } catch (parseErr) {
        log.error("podcastIndex.json.parse.fail", {
          error: String(parseErr),
          preview: text.slice(0, 200),
        });
        throw new Error(
          `PodcastIndex JSON parse error: ${String(parseErr)}`
        );
      }
    }

    if (!res.ok) {
      log.warn("podcastIndex.request.failed", {
        status: res.status,
        statusText: res.statusText,
        bodyPreview: text.slice(0, 200),
      });

      const err = new Error(
        `PodcastIndex ${res.status} ${res.statusText || "Error"}`
      );
      err.status = res.status;
      err.response = json;
      throw err;
    }

    return json;
  } finally {
    clearTimeout(timeout);
  }
}

// ------------------------------------------------------------
// 🎧 High-level helpers
// ------------------------------------------------------------
export async function getPodcastByFeedUrl(feedUrl) {
  if (!feedUrl) throw new Error("feedUrl is required");
  return podcastIndexRequest("/podcasts/byfeedurl", {
    query: { url: feedUrl },
  });
}

export async function getEpisodesByFeedUrl(
  feedUrl,
  { max = 20, since = null, fullText = false } = {}
) {
  if (!feedUrl) throw new Error("feedUrl is required");

  const query = {
    url: feedUrl,
    max,
    fulltext: fullText ? 1 : 0,
  };

  if (since) {
    query.since = since;
  }

  return podcastIndexRequest("/episodes/byfeedurl", { query });
}

export async function searchPodcastsByTerm(
  term,
  { max = 10, clean = true, fullText = false } = {}
) {
  if (!term) throw new Error("search term is required");

  const query = {
    q: term,
    max,
    clean: clean ? 1 : 0,
    fulltext: fullText ? 1 : 0,
  };

  return podcastIndexRequest("/search/byterm", { query });
}

export async function getTrendingPodcasts({
  max = 20,
  lang = "",
  cat = "",
  notcat = "",
} = {}) {
  const query = { max, lang, cat, notcat };

  return podcastIndexRequest("/podcasts/trending", { query });
}

export async function notifyHubByUrl(feedUrl) {
  if (!feedUrl) throw new Error("feedUrl is required");

  return podcastIndexRequest("/hub/pubnotify", {
    query: { url: feedUrl },
  });
}

export async function rawRequest(path, options = {}) {
  return podcastIndexRequest(path, options);
}

const podcastIndexClient = {
  getPodcastByFeedUrl,
  getEpisodesByFeedUrl,
  searchPodcastsByTerm,
  getTrendingPodcasts,
  notifyHubByUrl,
  rawRequest,
};

export default podcastIndexClient;
