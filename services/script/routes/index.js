// /services/script/routes/index.js
import express from "express";
import intro from "./intro.js";
import main from "./main.js";
import outro from "./outro.js";
import compose from "./compose.js";

const router = express.Router();

router.use("/intro", intro);
router.use("/main", main);
router.use("/outro", outro);
router.use("/compose", compose);

export default router;
