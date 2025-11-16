// services/rss-feed-creator/utils/rss-logger.js
import { info, error, warn, log } from "#logger.js";

class RssLogger {
  constructor() {
    this.metrics = {
      startTime: null,
      feedsProcessed: 0,
      itemsFetched: 0,
      itemsRewritten: 0,
      itemsUploaded: 0,
      errors: [],
      warnings: []
    };
  }

  startSession() {
    this.metrics.startTime = Date.now();
    this.metrics.errors = [];
    this.metrics.warnings = [];
    info("rss.session.start", { timestamp: new Date().toISOString() });
  }

  trackFeedFetch(feedUrl, itemsFound, itemsKept) {
    this.metrics.feedsProcessed++;
    this.metrics.itemsFetched += itemsFound;
    // Only log individually if there are filtering issues
    if (itemsKept < itemsFound) {
      warn("rss.feed.filtered", {
        feed: feedUrl,
        found: itemsFound,
        kept: itemsKept,
        filtered: itemsFound - itemsKept
      });
    }
  }

  trackItemRewrite(success = true, itemTitle = "") {
    if (success) {
      this.metrics.itemsRewritten++;
    } else {
      this.metrics.errors.push(`Rewrite failed: ${itemTitle}`);
    }
  }

  trackUpload(success = true, details = {}) {
    if (success) {
      this.metrics.itemsUploaded++;
    } else {
      this.metrics.errors.push(`Upload failed: ${JSON.stringify(details)}`);
    }
  }

  addWarning(message) {
    this.metrics.warnings.push(message);
    warn("rss.process.warning", { message });
  }

  endSession() {
    const duration = Date.now() - this.metrics.startTime;
    const successRate = this.metrics.itemsFetched > 0 
      ? (this.metrics.itemsRewritten / this.metrics.itemsFetched * 100).toFixed(1)
      : 0;

    // 📊 Consolidated Summary Log
    info("rss.session.summary", {
      durationMs: duration,
      durationHuman: `${(duration / 1000).toFixed(1)}s`,
      feedsProcessed: this.metrics.feedsProcessed,
      itemsFetched: this.metrics.itemsFetched,
      itemsRewritten: this.metrics.itemsRewritten,
      itemsUploaded: this.metrics.itemsUploaded,
      successRate: `${successRate}%`,
      warnings: this.metrics.warnings.length,
      errors: this.metrics.errors.length,
      ...(this.metrics.warnings.length > 0 && { warningDetails: this.metrics.warnings }),
      ...(this.metrics.errors.length > 0 && { errorDetails: this.metrics.errors })
    });

    // Reset for next session
    this.metrics = {
      startTime: null,
      feedsProcessed: 0,
      itemsFetched: 0,
      itemsRewritten: 0,
      itemsUploaded: 0,
      errors: [],
      warnings: []
    };
  }
}

// Singleton instance
export const rssLogger = new RssLogger();
export default rssLogger;
