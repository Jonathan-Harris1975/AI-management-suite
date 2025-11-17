// services/script/utils/script-logger.js
import {
  info as baseInfo,
  warn as baseWarn,
  error as baseError,
  debug as baseDebug,
} from "#logger.js";

function ukDateStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export class ScriptLogger {
  constructor() {
    this.currentRunId = null;
    this.startTime = 0;

    this.metrics = {
      articlesProcessed: 0,
      metaCompleted: 0,
      chunks: 0,
      errors: [],
      success: false,
    };

    this.debugEnabled = (process.env.LOG_LEVEL || "").toLowerCase() === "debug";
  }

  info(e, d = {}) { baseInfo(e, d); }
  warn(e, d = {}) { baseWarn(e, d); }
  error(e, d = {}) { baseError(e, d); }
  debug(e, d = {}) { if (this.debugEnabled) baseDebug(e, d); }

  // ------------------------------------------------------------
  // Start
  // ------------------------------------------------------------
  startProcess(id) {
    const run = id || `SCRIPT-${ukDateStamp()}`;
    this.currentRunId = run;
    this.startTime = Date.now();

    this.metrics = {
      articlesProcessed: 0,
      metaCompleted: 0,
      chunks: 0,
      errors: [],
      success: false,
    };

    this.info("script.process.start", { runId: run });
    this.debug("script.process.debugStartState", this.metrics);

    return run;
  }

  // ------------------------------------------------------------
  // Mutators
  // ------------------------------------------------------------
  addArticle() {
    this.metrics.articlesProcessed++;
    this.debug("script.process.articleProcessed", {
      total: this.metrics.articlesProcessed,
    });
  }

  addMetaCompleted() {
    this.metrics.metaCompleted++;
    this.debug("script.process.metaCompleted", {
      total: this.metrics.metaCompleted,
    });
  }

  addChunks(n) {
    this.metrics.chunks = n;
    this.debug("script.process.chunks", { count: n });
  }

  recordError(err) {
    const message = err?.message || String(err);
    this.metrics.errors.push(message);
    this.error("script.process.error", { error: message });
  }

  // ------------------------------------------------------------
  // End + FINAL SUMMARY
  // ------------------------------------------------------------
  endProcess(extra = {}) {
    const durationMs = Date.now() - this.startTime;

    const summary = {
      runId: this.currentRunId,
      durationMs,
      articlesProcessed: this.metrics.articlesProcessed,
      metaCompleted: this.metrics.metaCompleted,
      chunks: this.metrics.chunks,
      errors: this.metrics.errors,
      success: extra.success || this.metrics.errors.length === 0,
      timestamp: new Date().toISOString(),
      ...extra,
    };

    // 1) Standard completion log
    this.info("script.process.complete", summary);

    // 2) FINAL, authoritative summary event
    this.info("script.process.summary", summary);

    return summary;
  }
}

const scriptLogger = new ScriptLogger();
export default scriptLogger;
