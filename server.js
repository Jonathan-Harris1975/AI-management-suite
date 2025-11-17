import log from "#shared/utils/root-logger.js";
import "dotenv/config.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import routes from "./routes/index.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(
  cors({
    origin: "*",
  })
);
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/", routes);

// Basic health route
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "AI Podcast Suite" });
});

// Startup logs (now via root logger)
log.startup("bootstrap.start");
log.startup("env.verified");

app.listen(PORT, () => {
  log.server("listening", { port: PORT });
});

export default app;
