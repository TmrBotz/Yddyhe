// routes/gadgetsweb.js
const express = require('express');
const axios = require('axios');

const router = express.Router();

// ROT13 decode
function rot13(str) {
  return str.replace(/[a-zA-Z]/g, c =>
    String.fromCharCode(
      (c <= 'Z' ? 90 : 122) >= (c = c.charCodeAt(0) + 13) ? c : c - 26
    )
  );
}

// Full decode chain: atob → atob → rot13 → atob → JSON.parse
function decodeStorageValue(encoded) {
  const d1 = Buffer.from(encoded, 'base64').toString('utf8');
  const d2 = Buffer.from(d1, 'base64').toString('utf8');
  const d3 = rot13(d2);
  const d4 = Buffer.from(d3, 'base64').toString('utf8');
  return JSON.parse(d4);
}

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
      usage: "/api/gadgetsweb?url=https://gadgetsweb.xyz/?id=xxxxx"
    });
  }

  try {
    // Step 1: Fetch gadgetsweb.xyz page
    console.log(`[GadgetsWeb] Step 1: Fetching ${inputUrl}`);

    const gadgetswebRes = await axios.get(inputUrl, {
      headers: { ...HEADERS, 'Referer': 'https://gadgetsweb.xyz/' },
      timeout: 30000
    });

    const html = gadgetswebRes.data;

    // Step 2: Extract localStorage 'o' value from JS
    // s('o','ENCODED_VALUE',180*1000)
    const storageMatch = html.match(/s\('o','([^']+)',\s*\d+\s*\*\s*\d+\s*\)/);

    if (!storageMatch) {
      return res.status(404).json({
        success: false,
        error: "Could not extract encoded value from gadgetsweb page"
      });
    }

    const encodedValue = storageMatch[1];
    console.log(`[GadgetsWeb] Step 2: Extracted encoded value`);

    // Step 3: Decode the value
    let decoded;
    try {
      decoded = decodeStorageValue(encodedValue);
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: "Failed to decode storage value: " + e.message
      });
    }

    console.log(`[GadgetsWeb] Step 3: Decoded JSON:`, decoded);

    // decoded = { w: 10, l: "https://greenmountmotors.com/homelander/", o: "base64_final_url" }
    if (!decoded.o) {
      return res.status(404).json({
        success: false,
        error: "No final URL found in decoded value"
      });
    }

    // Step 4: Decode final URL (one more atob)
    const finalUrl = Buffer.from(decoded.o, 'base64').toString('utf8');
    console.log(`[GadgetsWeb] Step 4: Final URL: ${finalUrl}`);

    res.json({
      success: true,
      original_url: inputUrl,
      final_url: finalUrl,
      wait_time: decoded.w || 0
    });

  } catch (error) {
    console.error('[GadgetsWeb] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
