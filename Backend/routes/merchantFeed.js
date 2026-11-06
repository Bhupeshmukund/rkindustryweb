import express from "express";
import {
  buildMerchantFeedXml,
  fetchMerchantFeedItems
} from "../utils/merchantFeed.js";

const router = express.Router();

const sendFeed = async (req, res) => {
  try {
    const items = await fetchMerchantFeedItems();
    const xml = buildMerchantFeedXml(items);

    res.set("Content-Type", "application/xml; charset=utf-8");
    res.set("Cache-Control", "public, max-age=3600");
    res.send(xml);
  } catch (err) {
    console.error("MERCHANT FEED ERROR:", err);
    res.status(500).json({ error: err.message });
  }
};

router.get("/merchant-feed.xml", sendFeed);
router.get("/merchant-feed", sendFeed);

export default router;
