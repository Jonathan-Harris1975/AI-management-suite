import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// services/rss-feed-creator/index.js
import express from "express";
import cors from "cors";
import { log } from "../../../utils/logger.js";
import routes from "./routes/index.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/", routes);

log.info("✅ rss-feed-creator env OK");
log.info("🚀 RSS Feed Creator Service initialized");

export default app;
