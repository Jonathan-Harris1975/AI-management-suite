import { Router } from "express";
import { state } from "../state.js";

const router = Router();

router.get("/", (req, res) => {
  res.json({
    ok: true,
    services: {
      script: state.last.script,
      artwork: state.last.artwork,
      tts: state.last.tts,
    },
    lastRun: state.last.run,
  });
});

// ✅ named export so server.js can import { healthRouter }
export const healthRouter = router;
