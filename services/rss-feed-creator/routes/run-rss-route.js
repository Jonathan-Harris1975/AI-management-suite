// run-rss-route.js
import runRssRewriter from "./index.js";
import { endToEndRewrite } from "./rewrite-pipeline.js";
import { info, error } from "#logger.js";

export function registerRssRoute(app){
  app.post("/run-rss", (req, res) => {
    res.status(200).json({ ok: true, message: "RSS rewrite triggered" });
    setImmediate(async () => {
      try {
        info("rss.trigger.background.start");
        const r1 = await runRssRewriter();
        info("rss.trigger.background.rewriter.done", r1);
        const r2 = await endToEndRewrite();
        info("rss.trigger.background.endToEnd.done", r2);
        info("rss.trigger.background.complete");
      } catch (err) {
        error("rss.trigger.background.fail", { err: err.message });
      }
    });
  });
}
