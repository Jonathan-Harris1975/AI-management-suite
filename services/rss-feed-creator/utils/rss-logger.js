import { info as baseInfo, warn as baseWarn, error as baseError } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/utils/keepalive.js";

function formatDateUK() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

export class RssLogger {
  constructor(serviceName = "rss-feed-creator") {
    this.serviceName = serviceName;
    this.currentRunId = null;
    this.keepAliveLabel = null;

    this.metrics = {
      startTime: 0,
      feedsProcessed: 0,
      itemsFetched: 0,
      rewrittenItems: 0,
      itemsUploaded: 0,
      errors: []
    };
  }

  // Silence ALL logging except summary
  info() {}
  warn() {}
  error() {}
  stageStart() {}
  stageEnd() {}

  startRun(runId) {
    const id = runId || `RSS-${formatDateUK()}`;
    this.currentRunId = id;
    this.metrics = {
      startTime: Date.now(),
      feedsProcessed: 0,
      itemsFetched: 0,
      rewrittenItems: 0,
      itemsUploaded: 0,
      errors: []
    };

    this.keepAliveLabel = `rss-feed-creator:${id}`;
    startKeepAlive(this.keepAliveLabel, 15000);

    return id; // no log
  }

  addFeedProcessed(count) {
    this.metrics.feedsProcessed += count || 0;
  }

  addItemsFetched(count) {
    this.metrics.itemsFetched += count || 0;
  }

  addItemsRewritten(count) {
    this.metrics.rewrittenItems += count || 0;
  }

  addItemsUploaded(count) {
    this.metrics.itemsUploaded += count || 0;
  }

  recordError(err) {
    this.metrics.errors.push(err?.message || String(err));
  }

  endRun(extra = {}) {
    if (this.keepAliveLabel) stopKeepAlive(this.keepAliveLabel);

    const now = Date.now();
    const durationMs = now - this.metrics.startTime;

    const summary = {
      runId: this.currentRunId,
      durationMs,
      feedsProcessed: this.metrics.feedsProcessed,
      itemsFetched: this.metrics.itemsFetched,
      itemsRewritten: this.metrics.rewrittenItems,
      itemsUploaded: this.metrics.itemsUploaded,
      errors: this.metrics.errors,
      ...extra
    };

    // ONLY SUMMARY LOG REMAINS
    baseInfo("rss-feed-creator.run.summary", summary);

    return summary;
  }

  runError(err) {
    this.recordError(err);
    return this.endRun();
  }
}

const rssLogger = new RssLogger();
export default rssLogger;
