// services/script/utils/script-logger.js
// ------------------------------------------------------------
// Modular Script Logger
// ------------------------------------------------------------
// - No running dialogue / no keep-alive
// - Simple start → process → summary lifecycle
// - Structured JSON output
// - Full debug mode when LOG_LEVEL=debug
// ------------------------------------------------------------

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
      errors: [],
    };

    this.debugEnabled = (process.env.LOG_LEVEL || "").toLowerCase() === "debug";
  }

  // ------------------------------------------------------------
  // Basic wrappers
  // ------------------------------------------------------------

  info(event, data = {}) { baseInfo(event, data); }
  warn(event, data = {}) { baseWarn(event, data); }
  error(event, data = {}) { baseError(event, data); }
  debug(event, data = {}) { 
    if (this.debugEnabled) baseDebug(event, data); 
  }

  // ------------------------------------------------------------
  // Process lifecycle
  // ------------------------------------------------------------

  startProcess(id) {
    const run = id || `SCRIPT-${ukDateStamp()}`;

    this.currentRunId = run;
    this.startTime = Date.now();

    this.metrics = {
      articlesProcessed: 0,
      metaCompleted: 0,
      errors: [],
    };

    this.info("script.process.start", {
      runId: run,
      message: "Script processing started",
    });

    this.debug("script.process.debugStartState", {
      runId: run,
      initialMetrics: this.metrics,
    });

    return run;
  }

  // ------------------------------------------------------------
  // Increment counters
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

  recordError(e) {
    const msg = e?.message || String(e);
    this.metrics.errors.push(msg);

    this.error("script.process.errorRecorded", { error: msg });
  }

  // ------------------------------------------------------------
  // End
  // ------------------------------------------------------------

  endProcess(extra = {}) {
    const durationMs = Date.now() - this.startTime;

    const summary = {
      runId: this.currentRunId,
      durationMs,
      articlesProcessed: this.metrics.articlesProcessed,
      metaCompleted: this.metrics.metaCompleted,
      errors: this.metrics.errors,
      ...extra,
    };

    this.info("script.process.complete", summary);

    return summary;
  }

  processError(e) {
    this.recordError(e);
    return this.endProcess();
  }
}

const scriptLogger = new ScriptLogger();
export default scriptLogger;
