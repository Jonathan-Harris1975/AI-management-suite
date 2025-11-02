// services/artwork/routes/createArtwork.js
import express from "express";
import { putJson } from "../../shared/utils/r2-client.js";
import { info, error } from "#logger.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};
    const key = `artwork/requests/${Date.now()}.json`;
    await putJson("art", key, payload);

    info("artwork.create.stored", { key });
    res.json({ ok: true, key });
  } catch (err) {
    error("artwork.create.fail", { error: err.message });
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
