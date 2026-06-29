// routes/gadgetsweb.js
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

// HubCloud → gamerxyt → download links (reused from hubdrive route)
async function scrapeHubcloud(hubcloudUrl) {
  console.log(`[GadgetsWeb] HubCloud: ${hubcloudUrl}`);

  const hubcloudRes = await axios.get(hubcloudUrl, {
    headers: { ...HEADERS, 'Referer': 'https://hubcloud.cx/', 'Origin': 'https://hubcloud.cx' },
    timeout: 30000
  });

  const hubcloudHtml = hubcloudRes.data;
  let gamerxytUrl = null;

  const m1 = hubcloudHtml.match(/id="download"\s+href=['"](https:\/\/gamerxyt\.com\/hubcloud\.php[^'"]+)['"]/);
  if (m1) gamerxytUrl = m1[1];

  if (!gamerxytUrl) {
    const m2 = hubcloudHtml.match(/href=['"](https:\/\/gamerxyt\.com\/hubcloud\.php[^'"]+)['"]/);
    if (m2) gamerxytUrl = m2[1];
  }

  if (!gamerxytUrl) {
    const m3 = hubcloudHtml.match(/var\s+url\s*=\s*['"](https:\/\/gamerxyt\.com\/hubcloud\.php[^'"]+)['"]/);
    if (m3) gamerxytUrl = m3[1];
  }

  if (!gamerxytUrl) throw new Error('No gamerxyt link found on hubcloud page');

  console.log(`[GadgetsWeb] Gamerxyt: ${gamerxytUrl}`);

  const gamerxytRes = await axios.get(gamerxytUrl, {
    headers: { ...HEADERS, 'Referer': 'https://gamerxyt.com/', 'Origin': 'https://gamerxyt.com' },
    timeout: 30000
  });

  const $ = cheerio.load(gamerxytRes.data);

  const fileInfo = {
    name: $('.card-header.text-white').text().trim() || $('title').text().trim(),
    size: $('#size').text().trim() || $('li:contains("File Size") i').text().trim(),
    type: $('li:contains("File Type") i').text().trim(),
    share_date: $('#date').text().trim() || $('li:contains("Share Date") i').text().trim()
  };

  const downloadLinks = [];

  const fslv2 = $('#s3');
  if (fslv2.length && fslv2.attr('href')) {
    downloadLinks.push({ url: fslv2.attr('href'), server: 'FSLv2 Server', label: 'Download [FSLv2 Server]' });
  }

  const fsl = $('#fsl');
  if (fsl.length && fsl.attr('href')) {
    downloadLinks.push({ url: fsl.attr('href'), server: 'FSL Server', label: 'Download [FSL Server]' });
  }

  $('a.btn-danger').each((i, el) => {
    const href = $(el).attr('href');
    if (href && href.includes('gpdl.hubcloud.cx')) {
      downloadLinks.push({ url: href, server: '10Gbps Server', label: $(el).text().trim() || 'Download [10Gbps]', note: 'Resume Not Supported' });
    }
  });

  const pixel = $('#pxl-1');
  if (pixel.length && pixel.attr('href') && pixel.attr('href').includes('pixeldrain.dev')) {
    downloadLinks.push({ url: pixel.attr('href'), server: 'PixelServer', label: pixel.text().trim() || 'Download [PixelServer]' });
  }

  $('a[href*="hubcloud.cx/tg/go"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href) downloadLinks.push({ url: href, server: 'Telegram', label: $(el).text().trim() || 'Download From Telegram' });
  });

  $('a[href*=".mkv"]').each((i, el) => {
    const href = $(el).attr('href');
    if (href && !downloadLinks.some(l => l.url === href)) {
      downloadLinks.push({ url: href, server: 'Additional Server', label: $(el).text().trim() || 'Download Link' });
    }
  });

  return { fileInfo, downloadLinks, gamerxyt_url: gamerxytUrl };
}

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
    // ── Step 1: Fetch gadgetsweb.xyz ──
    console.log(`[GadgetsWeb] Step 1: ${inputUrl}`);

    const gadgetswebRes = await axios.get(inputUrl, {
      headers: { ...HEADERS, 'Referer': 'https://gadgetsweb.xyz/' },
      timeout: 30000
    });

    // ── Step 2: Extract & decode localStorage value ──
    const storageMatch = gadgetswebRes.data.match(/s\('o','([^']+)',\s*\d+\s*\*\s*\d+\s*\)/);
    if (!storageMatch) {
      return res.status(404).json({ success: false, error: 'Could not extract encoded value from gadgetsweb page' });
    }

    let decoded;
    try {
      decoded = decodeStorageValue(storageMatch[1]);
    } catch (e) {
      return res.status(500).json({ success: false, error: 'Decode failed: ' + e.message });
    }

    if (!decoded.o) {
      return res.status(404).json({ success: false, error: 'No final URL in decoded value' });
    }

    // ── Step 3: Decode final hblinks URL ──
    const hblinksUrl = Buffer.from(decoded.o, 'base64').toString('utf8');
    console.log(`[GadgetsWeb] Step 3: hblinks URL: ${hblinksUrl}`);

    // ── Step 4: Scrape hblinks page → get hubcloud link ──
    const hblinksRes = await axios.get(hblinksUrl, {
      headers: { ...HEADERS, 'Referer': 'https://hblinks.co/' },
      timeout: 30000
    });

    const $hb = cheerio.load(hblinksRes.data);

    // Extract hubcloud link
    let hubcloudUrl = null;
    $hb('a[href*="hubcloud.cx/drive/"]').each((i, el) => {
      if (!hubcloudUrl) hubcloudUrl = $hb(el).attr('href');
    });

    if (!hubcloudUrl) {
      return res.status(404).json({
        success: false,
        error: 'No hubcloud link found on hblinks page',
        hblinks_url: hblinksUrl
      });
    }

    console.log(`[GadgetsWeb] Step 4: HubCloud URL: ${hubcloudUrl}`);

    // ── Step 5: Scrape hubcloud → gamerxyt → download links ──
    const { fileInfo, downloadLinks, gamerxyt_url } = await scrapeHubcloud(hubcloudUrl);

    if (downloadLinks.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No download links found',
        hblinks_url: hblinksUrl,
        hubcloud_url: hubcloudUrl,
        gamerxyt_url
      });
    }

    // ── Final Response ──
    res.json({
      success: true,
      original_url: inputUrl,
      hblinks_url: hblinksUrl,
      hubcloud_url: hubcloudUrl,
      file_info: fileInfo,
      download_links: downloadLinks,
      total_servers: downloadLinks.length
    });

  } catch (error) {
    console.error('[GadgetsWeb] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
