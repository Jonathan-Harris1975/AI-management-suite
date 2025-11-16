// ============================================================
// 📡 Centralised RSS Feed Creator Logger (Hardened)
// ============================================================
//
// Features:
//   • Emoji-first, human readable messages
//   • UK timestamps: 2025.11.16 14:22:10
//   • Run-scoped IDs: RSS-2025-11-16
//   • Structured summary events for Shiper + dashboards
//   • Built-in silent keepalive to protect long RSS runs
//   • Stage helpers for pipeline-style logs
//   • Verbose debug mode via RSS_DEBUG=true
//
// No behaviour changes for existing callers.
// Drop-in compatible.
//
// ============================================================

import {
  info as baseInfo,
  warn as baseWarn,
  error as baseError,
} from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/keepalive.js";

const DEBUG = process.env.RSS_DEBUG === "true";

// ------------------------------------------------------------
// 📅 Time helpers (UK format)
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// 🧠 Logger Class
// ------------------------------------------------------------
class RssLogger {
  constructor() {
    this.currentRunId = null;
    this.keepAliveLabel = null;
    this.resetMetrics();

// Bind methods to preserve `this` when used in callbacks or destructured
this.info = this.info.bind(this);
this.warn = this.warn.bind(this);
this.error = this.error.bind(this);
this.stageStart = this.stageStart.bind(this);
this.stageEnd = this.stageEnd.bind(this);
this.startRun = this.startRun.bind(this);
this.endRun = this.endRun.bind(this);
this.runError = this.runError.bind(this);
this.incFeedsProcessed = this.incFeedsProcessed.bind(this);
this.incItemsFetched = this.incItemsFetched.bind(this);
this.incItemsRewritten = this.incItemsRewritten.bind(this);
this.incItemsUploaded = this.incItemsUploaded.bind(this);
this.addWarning = this.addWarning.bind(this);
this.addError = this.addError.bind(this);
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

  // Legacy facade support: logger.log.info(...)
  get log() {
    return {
      info: (...args) => this.info(...args),
      warn: (...args) => this.warn(...args),
      error: (...args) => this.error(...args),
    };
  }

  // ------------------------------------------------------------
  // 🏁 Run lifecycle
  // ------------------------------------------------------------
  startRun(optionalRunId) {
    const datePart = formatDateUK();
    const runId = optionalRunId || `RSS-${datePart}`;

    this.currentRunId = runId;
    this.resetMetrics();
    this.metrics.startTime = Date.now();

    this.keepAliveLabel = `rss-feed-creator:${runId}`;

    try {
      startKeepAlive(this.keepAliveLabel, 15000);
    } catch (err) {
      baseWarn("rss.keepalive.start.failed", { error: err.message });
    }

    this.info(`📝 RSS run started (${runId}). Logs will show progress.`);

    if (DEBUG) {
      this.info("🔍 DEBUG MODE ENABLED — verbose RSS logging active");
    }

    return runId;
  }

  endRun(extra = {}) {
    if (this.metrics.startTime) {
      this.metrics.durationMs = Date.now() - this.metrics.startTime;
    }

    if (this.keepAliveLabel) {
      try {
        stopKeepAlive(this.keepAliveLabel);
      } catch (err) {
        baseWarn("rss.keepalive.stop.failed", { error: err.message });
      }
      this.keepAliveLabel = null;
    }

    const seconds =
      this.metrics.durationMs != null
        ? Math.round(this.metrics.durationMs / 1000)
        : null;

    this.info(
      `🗃️ RSS run completed${
        seconds != null ? ` in ${seconds}s` : ""
      }. Feeds: ${this.metrics.feedsProcessed}, Rewritten items: ${
        this.metrics.itemsRewritten
      }, Uploaded: ${this.metrics.itemsUploaded}.`
    );

    baseInfo("rss-feed-creator.run.summary", {
      runId: this.currentRunId,
      ...this.metrics,
      ...extra,
    });
  }

  runError(err, extra = {}) {
    const message = err?.message || String(err);
    this.metrics.errors.push(message);

    if (this.keepAliveLabel) {
      try {
        stopKeepAlive(this.keepAliveLabel);
      } catch {}
      this.keepAliveLabel = null;
    }

    this.error(`RSS run failed: ${message}`);

    baseError("rss-feed-creator.run.error", {
      runId: this.currentRunId,
      message,
      ...extra,
    });
  }

  // ------------------------------------------------------------
  // 📊 Metrics helpers
  // ------------------------------------------------------------
  incFeedsProcessed(n = 1) {
    this.metrics.feedsProcessed += n;
    if (DEBUG) this.info(`🧮 feedsProcessed += ${n}`);
  }

  incItemsFetched(n = 1) {
    this.metrics.itemsFetched += n;
    if (DEBUG) this.info(`🧮 itemsFetched += ${n}`);
  }

  incItemsRewritten(n = 1) {
    this.metrics.itemsRewritten += n;
    if (DEBUG) this.info(`🧮 itemsRewritten += ${n}`);
  }

  incItemsUploaded(n = 1) {
    this.metrics.itemsUploaded += n;
    if (DEBUG) this.info(`🧮 itemsUploaded += ${n}`);
  }

  addWarning(message) {
    this.metrics.warnings.push(message);
    this.warn(message);
  }

  addError(message) {
    this.metrics.errors.push(message);
    this.error(message);
  }

  // ------------------------------------------------------------
  // 🎙️ Log wrappers (emoji-first)
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // 🧩 Stage helpers (nicely structured pipeline logs)
  // ------------------------------------------------------------
  stageStart(stageName, message) {
    this.info(`🟧 [${stageName}] ${message || "started"}`);
  }

  stageEnd(stageName, message) {
    this.info(`🟩 [${stageName}] ${message || "completed"}`);
  }

  writeRaw(msg) {
    // Low-level direct log (used for debugging raw fetch)
    baseInfo(`📜 ${this._prefix()} — ${msg}`);
  }
}

// Singleton instance
export const rssLogger = new RssLogger();
export default rssLogger;
