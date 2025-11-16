// services/rss-feed-creator/utils/rss-logger.js
// Centralised logger for all RSS feed creator activity.
// ✅ Emoji-first, human readable
// ✅ Message-only (all context baked into the string)
// ✅ UK-style timestamps: 2025.11.16 14:22:10
// ✅ Grouped by runId (e.g. RSS-2025-11-16)
// ✅ Integrated with global #logger.js and #shared/keepalive.js

import { info as baseInfo, warn as baseWarn, error as baseError } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";

function formatDateUK(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatDateTimeUK(date = new Date()) {
  const datePart = formatDateUK(date);
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${datePart} ${h}:${min}:${s}`;
}

class RssLogger {
  constructor() {
    this.currentRunId = null;
    this.keepAliveLabel = null;
    this.resetMetrics();
  }

  resetMetrics() {
    this.metrics = {
      startTime: null,
      feedsProcessed: 0,
      itemsFetched: 0,
      itemsRewritten: 0,
      itemsUploaded: 0,
      errors: [],
      warnings: [],
      durationMs: null,
    };
  }

  get runId() {
    return this.currentRunId;
  }

  _ts() {
    return formatDateTimeUK();
  }

  _prefix() {
    const ts = this._ts();
    const run = this.currentRunId ? ` | ${this.currentRunId}` : "";
    return `${ts}${run}`;
  }

  // Expose a log facade so legacy code can do log.info(...)
  get log() {
    return {
      info: (...args) => this.info(...args),
      warn: (...args) => this.warn(...args),
      error: (...args) => this.error(...args),
    };
  }

  // ─────────────────────────────────────────────
  // 🧵 Run lifecycle
  // ─────────────────────────────────────────────

  startRun(optionalRunId) {
    const datePart = formatDateUK();
    const runId = optionalRunId || `RSS-${datePart}`;

    this.currentRunId = runId;
    this.resetMetrics();
    this.metrics.startTime = Date.now();

    // Silent keep-alive to avoid idle timeouts
    this.keepAliveLabel = `rss-feed-creator:${runId}`;
    try {
      startKeepAlive(this.keepAliveLabel, 15000);
    } catch {
      // keepalive is best-effort; never break the app
    }

    this.info(`🟧 RSS run started (${runId}). Logs will show progress.`);
    return runId;
  }

  endRun(extra = {}) {
    if (this.metrics.startTime) {
      this.metrics.durationMs = Date.now() - this.metrics.startTime;
    }

    if (this.keepAliveLabel) {
      try {
        stopKeepAlive(this.keepAliveLabel);
      } catch {
        // ignore
      }
      this.keepAliveLabel = null;
    }

    const seconds =
      this.metrics.durationMs != null
        ? Math.round(this.metrics.durationMs / 1000)
        : null;

    this.info(
      `🟩 RSS run completed${seconds != null ? ` in ${seconds}s` : ""}. ` +
        `Feeds: ${this.metrics.feedsProcessed}, ` +
        `Rewritten items: ${this.metrics.itemsRewritten}, ` +
        `Uploaded items: ${this.metrics.itemsUploaded}.`
    );

    const summary = {
      runId: this.currentRunId,
      ...this.metrics,
      ...extra,
    };

    // Structured summary (single machine-friendly event)
    baseInfo("rss-feed-creator.run.summary", summary);
  }

  runError(err, extra = {}) {
    const message = err?.message || String(err);
    this.metrics.errors.push(message);

    if (this.keepAliveLabel) {
      try {
        stopKeepAlive(this.keepAliveLabel);
      } catch {
        // ignore
      }
      this.keepAliveLabel = null;
    }

    this.error(`RSS run failed: ${message}`);
    baseError("rss-feed-creator.run.error", {
      runId: this.currentRunId,
      message,
      ...extra,
    });
  }

  // ─────────────────────────────────────────────
  // 📊 Metrics helpers
  // ─────────────────────────────────────────────

  incFeedsProcessed(n = 1) {
    this.metrics.feedsProcessed += n;
  }

  incItemsFetched(n = 1) {
    this.metrics.itemsFetched += n;
  }

  incItemsRewritten(n = 1) {
    this.metrics.itemsRewritten += n;
  }

  incItemsUploaded(n = 1) {
    this.metrics.itemsUploaded += n;
  }

  addWarning(message) {
    this.metrics.warnings.push(message);
    this.warn(message);
  }

  addError(message) {
    this.metrics.errors.push(message);
    this.error(message);
  }

  // ─────────────────────────────────────────────
  // 🎙️ Log wrappers (emoji-first, message-only)
  // ─────────────────────────────────────────────

  info(message, meta) {
    if (meta && typeof meta === "object") {
      baseInfo(`📰 ${this._prefix()} — ${message}`, meta);
    } else {
      baseInfo(`📰 ${this._prefix()} — ${message}`);
    }
  }

  warn(message, meta) {
    if (meta && typeof meta === "object") {
      baseWarn(`⚠️ ${this._prefix()} — ${message}`, meta);
    } else {
      baseWarn(`⚠️ ${this._prefix()} — ${message}`);
    }
  }

  error(message, meta) {
    if (meta && typeof meta === "object") {
      baseError(`💥 ${this._prefix()} — ${message}`, meta);
    } else {
      baseError(`💥 ${this._prefix()} — ${message}`);
    }
  }

  // Optional stage helpers for nicer pipeline logs
  stageStart(stageName, message) {
    this.info(`🟧 [${stageName}] ${message || "started"}`);
  }

  stageEnd(stageName, message) {
    this.info(`🟩 [${stageName}] ${message || "completed"}`);
  }
}

// Singleton instance
export const rssLogger = new RssLogger();
export default rssLogger;
