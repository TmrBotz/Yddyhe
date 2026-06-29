// routes/hubcdn.js
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0'
};

router.get('/', async (req, res) => {
  const inputUrl = req.query.url;

  if (!inputUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing 'url' parameter",
      usage: "/api/hubcdn?url=https://hubcdn.sbs/file/xxxxx"
    });
  }

  try {
    // ── Step 1: Fetch hubcdn.sbs/file/ page ──
    console.log(`[HubCDN] Step 1: ${inputUrl}`);

    const step1Res = await axios.get(inputUrl, {
      headers: { ...HEADERS, 'Referer': 'https://hubcdn.sbs/' },
      timeout: 30000
    });

    // Extract reurl from JS
    // var reurl = "https://inventoryidea.com/?r=BASE64";
    const reurlMatch = step1Res.data.match(/var\s+reurl\s*=\s*["'](https:\/\/inventoryidea\.com\/\?r=([^"']+))["']/);

    if (!reurlMatch) {
      return res.status(404).json({
        success: false,
        error: 'Could not extract reurl from hubcdn page'
      });
    }

    const base64Param = reurlMatch[2];
    console.log(`[HubCDN] Step 1: Extracted base64 param`);

    // ── Step 2: Decode base64 → hubcdn.sbs/dl/ URL ──
    const dlUrl = Buffer.from(base64Param, 'base64').toString('utf8');
    console.log(`[HubCDN] Step 2: Decoded DL URL: ${dlUrl}`);

    // Validate decoded URL
    if (!dlUrl.startsWith('https://hubcdn.sbs/dl/')) {
      return res.status(500).json({
        success: false,
        error: 'Decoded URL is not a valid hubcdn dl URL',
        decoded: dlUrl
      });
    }

    // ── Step 3: Fetch hubcdn.sbs/dl/ page ──
    console.log(`[HubCDN] Step 3: Fetching ${dlUrl}`);

    const step3Res = await axios.get(dlUrl, {
      headers: { ...HEADERS, 'Referer': 'https://hubcdn.sbs/' },
      timeout: 30000
    });

    const $ = cheerio.load(step3Res.data);

    // Extract final link from <a id="vd" href="...">
    const finalLink = $('#vd').attr('href');

    if (!finalLink) {
      return res.status(404).json({
        success: false,
        error: 'Could not find final download link on hubcdn dl page',
        dl_url: dlUrl
      });
    }

    console.log(`[HubCDN] Step 3: Final link: ${finalLink}`);

    // ── Final Response ──
    res.json({
      success: true,
      original_url: inputUrl,
      dl_url: dlUrl,
      download_link: finalLink
    });

  } catch (error) {
    console.error('[HubCDN] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
