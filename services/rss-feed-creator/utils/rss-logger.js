
import { info as baseInfo } from "#logger.js";
import { startKeepAlive, stopKeepAlive } from "#shared/utils/keepalive.js";

function formatDateUK() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`;
}

export class RssLogger {
  constructor() {
    this.currentRunId=null;
    this.keepAliveLabel=null;
    this.metrics={startTime:0,feedsProcessed:0,itemsFetched:0,rewrittenItems:0,itemsUploaded:0,errors:[]};
  }

  info(){} warn(){} error(){} stageStart(){} stageEnd(){}

  startRun(id){
    const run=id||`RSS-${formatDateUK()}`;
    this.currentRunId=run;
    this.metrics={startTime:Date.now(),feedsProcessed:0,itemsFetched:0,rewrittenItems:0,itemsUploaded:0,errors:[]};
    this.keepAliveLabel=`rss-feed-creator:${run}`;
    startKeepAlive(this.keepAliveLabel,15000);
    return run;
  }

  addFeedProcessed(n){this.metrics.feedsProcessed+=n||0;}
  addItemsFetched(n){this.metrics.itemsFetched+=n||0;}
  addItemsRewritten(n){this.metrics.rewrittenItems+=n||0;}
  addItemsUploaded(n){this.metrics.itemsUploaded+=n||0;}
  recordError(e){this.metrics.errors.push(e?.message||String(e));}

  endRun(extra={}){
    stopKeepAlive(this.keepAliveLabel);
    const out={
      runId:this.currentRunId,
      durationMs:Date.now()-this.metrics.startTime,
      feedsProcessed:this.metrics.feedsProcessed,
      itemsFetched:this.metrics.itemsFetched,
      itemsRewritten:this.metrics.rewrittenItems,
      itemsUploaded:this.metrics.itemsUploaded,
      errors:this.metrics.errors,
      ...extra
    };
    // No msg field at all
    baseInfo("rss-feed-creator.run.summary.noMsg", out);
    return out;
  }

  runError(e){this.recordError(e);return this.endRun();}
}

const rssLogger=new RssLogger();
export default rssLogger;
