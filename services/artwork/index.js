// services/artwork/index.js
import express from "express";
import routes from "./routes/index.js";

const router = express.Router();

// mount all artwork subroutes (create, generate, etc.)
router.use("/", routes);

export default router;
