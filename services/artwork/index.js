// services/artwork/index.js
import express from "express";
import routes from "./routes/index.js";

const router = express.Router();

// mount all subroutes (create, generate)
router.use("/", routes);

export default router;
