// services/artwork/routes/createArtwork.js
import express from "express";
import { putJson } from "#shared/r2-client.js"; // Fixed import path
import { info, error } from "#logger.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};
    const key = `artwork/requests/${Date.now()}.json`;
    await putJson("art", key, payload);
    info("artwork.create.stored", { key });
    return res.json({ ok: true, key });
  } catch (err) {
    error("artwork.create.fail", { message: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
