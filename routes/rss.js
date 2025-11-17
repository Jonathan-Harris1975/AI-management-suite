import log from ;
// /routes/rss.js — AI Podcast Suite (Final Stable 2025-10-11)
import express from ;
import { getObject } from ;

const router = express.Router();

/**
 * Handles both GET (fetch RSS) and POST (rebuild RSS feed)
 */
router.all(, async (req, res) => {
  const isPost = req.method === ;

  if (!isPost) {
    try {
      const xml = await getObject();
      res.set(, );
      res.send(
        xml || 
      );
    } catch (err) {
      res.status(500).json({
        success: false,
        route: ,
        message: ,
        error: err.message,
      });
    }
  } else {
    try {
      // Placeholder for RSS rebuild logic (e.g. re-run rewrite pipeline)
      const result = { note:  };
      res.status(200).json({
        success: true,
        route: ,
        message: ,
        result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        route: ,
        message: ,
        error: error.message,
      });
    }
  }
});

export default router;
