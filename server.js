// server.js
import express from "express";
import cors from "cors";
import os from "os";
import { log,info,debug}  from "#logger.js";
import routes from "./routes/index.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Mount all routes at once
app.use("/", routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  info("🟩 AI Podcast Suite started on port " + PORT);
  debug("📡 Endpoints: RSS, Script, TTS, Artwork, Podcast Pipeline");
});
