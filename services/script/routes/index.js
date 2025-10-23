// services/script/routes/index.js

import { orchestrateScript } from "../utils/orchestrator.js";
import express from "express";
import intro from "./intro.js";
import main from "./main.js";
import outro from "./outro.js";
import compose from "./compose.js";


const router = express.Router();

// Individual stage endpoints
router.use("/", intro);
router.use("/", main);
router.use("/", outro);
router.use("/", compose);

// Central orchestrator endpoint
router.post("/orchestrate");

export default router;
