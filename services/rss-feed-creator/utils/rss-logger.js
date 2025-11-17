// services/rss-feed-creator/utils/rss-logger.js
// Centralised logger for all RSS feed creator processes.
// Clean, minimal, human-readable logs with compact summaries.

// SILENT import { info as baseInfo, warn as baseWarn, error as baseError } from "#logger.js";
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

    // 🔐 Bind all methods to preserve `this` no matter how they're used
    this.info = this.info.bind(this);
    this.warn = this.warn.bind(this);
    this.error = this.error.bind(this);
    this.startRun = this.startRun.bind(this);
    this.endRun = this.endRun.bind(this);
    this.runError = this.runError.bind(this);
    this.stageStart = this.stageStart.bind(this);
    this.stageEnd = this.stageEnd.bind(this);
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

  _ts() {
    return formatDateTimeUK();
  }

  _prefix() {
    return `${this._ts()} | ${this.currentRunId}`;
  }

  // ─────────────────────────────────────────────
  // 🧵 Run lifecycle
  // ─────────────────────────────────────────────

  startRun(optionalRunId) {
    const datePart = formatDateUK();
    this.currentRunId = optionalRunId || `RSS-${datePart}`;
    this.resetMetrics();
    this.metrics.startTime = Date.now();

    // Silent keep-alive
    this.keepAliveLabel = `rss-feed-creator:${this.currentRunId}`;
    startKeepAlive(this.keepAliveLabel, 15000);

    this.info(`📝 RSS run started (${this.currentRunId}). Logs will show progress.`);

    return this.currentRunId;
  }

  endRun(extra = {}) {
    if (this.metrics.startTime) {
      this.metrics.durationMs = Date.now() - this.metrics.startTime;
    }

    if (this.keepAliveLabel) {
      stopKeepAlive(this.keepAliveLabel);
      this.keepAliveLabel = null;
    }

    const seconds = Math.round(this.metrics.durationMs / 1000);
    const { totalItems = 0, rewrittenItems = 0 } = extra;

    // ─────────────────────────────────────────────
    // 📊 COMPACT SUMMARY OUTPUT (only log you want)
    // ─────────────────────────────────────────────
    const summaryTable =
      `📊 RSS Run Summary\n` +
      `Run ID: ${this.currentRunId}\n` +
      `Duration: ${seconds}s\n` +
      `Selected Feeds: ${this.metrics.feedsProcessed}\n` +
      `Valid Parsed Feeds: ${this.metrics.itemsFetched}\n` +
      `Feed Errors: ${this.metrics.errors.length}\n` +
      `Fresh Items: ${totalItems}\n` +
      `Rewritten: ${rewrittenItems}\n` +
      `Uploaded: ${this.metrics.itemsUploaded}\n` +
      `Result: Completed`;

    this.info(summaryTable);

    // Machine-readable summary
    baseInfo("rss-feed-creator.run.summary", {
      runId: this.currentRunId,
      durationMs: this.metrics.durationMs,
      feedsProcessed: this.metrics.feedsProcessed,
      itemsFetched: this.metrics.itemsFetched,
      itemsRewritten: rewrittenItems,
      itemsUploaded: this.metrics.itemsUploaded,
      errors: this.metrics.errors,
    });
  }

  runError(err, extra = {}) {
    const message = err?.message || String(err);
    this.metrics.errors.push(message);

    if (this.keepAliveLabel) {
      stopKeepAlive(this.keepAliveLabel);
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
  // 📊 Metric helpers
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
  }

  addError(message) {
    this.metrics.errors.push(message);
  }

  // ─────────────────────────────────────────────
  // 🎙️ Logging (emoji-first, message-only)
  // ─────────────────────────────────────────────

  info(message) {
// SILENT     baseInfo(`📰 ${this._prefix()} — ${message}`);
  }

  warn(message) {
    baseWarn(`⚠️ ${this._prefix()} — ${message}`);
  }

  error(message) {
    baseError(`💥 ${this._prefix()} — ${message}`);
  }

  // Only kept for compatibility — but actual stage logs are minimal
  stageStart(stage, msg) {
    this.info(`🟧 [${stage}] ${msg || "started"}`);
  }

  stageEnd(stage, msg) {
    this.info(`🟩 [${stage}] ${msg || "completed"}`);
  }
}

export const rssLogger = new RssLogger();
export default rssLogger;