// services/artwork/index.js
import express from "express";
import routes from "./routes/index.js";

const router = express.Router();
// mount all artwork subroutes at root: /artwork/*
router.use("/", routes);

export default router;
