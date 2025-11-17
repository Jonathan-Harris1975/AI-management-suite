import scriptLogger from "./script-logger.js";
const { info, warn, error, debug } = scriptLogger;
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
      errors: [],
    };
    this.debugEnabled = (process.env.LOG_LEVEL || "").toLowerCase() === "debug";
  }
  info(e,d={}){ baseInfo(e,d);}
  warn(e,d={}){ baseWarn(e,d);}
  error(e,d={}){ baseError(e,d);}
  debug(e,d={}){ if(this.debugEnabled) baseDebug(e,d);}
  startProcess(id){
    const run=id||`SCRIPT-${ukDateStamp()}`;
    this.currentRunId=run;
    this.startTime=Date.now();
    this.metrics={articlesProcessed:0,metaCompleted:0,errors:[]};
    this.info("script.process.start",{runId:run});
    return run;
  }
  addArticle(){this.metrics.articlesProcessed++;}
  addMetaCompleted(){this.metrics.metaCompleted++;}
  recordError(e){this.metrics.errors.push(e?.message||String(e));}
  endProcess(extra={}){
    const summary={
      runId:this.currentRunId,
      durationMs:Date.now()-this.startTime,
      articlesProcessed:this.metrics.articlesProcessed,
      metaCompleted:this.metrics.metaCompleted,
      errors:this.metrics.errors,
      ...extra
    };
    this.info("script.process.complete",summary);
    return summary;
  }
}

const scriptLogger=new ScriptLogger();
export default scriptLogger;
