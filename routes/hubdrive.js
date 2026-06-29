const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();

router.get('/', async (req, res) => {
  const hubdriveUrl = req.query.url;

  if (!hubdriveUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing 'url' parameter",
      usage: "/api/hubdrive?url=https://hubdrive.tips/file/xxxxx"
    });
  }

  try {
    // Step 1: hubdrive → hubcloud link
    console.log(`[HubDrive] Step 1: ${hubdriveUrl}`);

    const hubdriveResponse = await axios.get(hubdriveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://hubdrive.tips/',
        'Origin': 'https://hubdrive.tips'
      },
      timeout: 30000
    });

    const hubcloudMatch = hubdriveResponse.data.match(/href=['"](https:\/\/hubcloud\.cx\/drive\/[a-zA-Z0-9]+)['"]/);

    if (!hubcloudMatch) {
      return res.status(404).json({
        success: false,
        error: "No hubcloud link found on hubdrive page"
      });
    }

    const hubcloudLink = hubcloudMatch[1];
    console.log(`[HubDrive] Step 1 done: ${hubcloudLink}`);

    // Step 2: hubcloud → gamerxyt link
    console.log(`[HubDrive] Step 2: ${hubcloudLink}`);

    const hubcloudResponse = await axios.get(hubcloudLink, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://hubcloud.cx/',
        'Origin': 'https://hubcloud.cx'
      },
      timeout: 30000
    });

    const hubcloudHtml = hubcloudResponse.data;
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

    if (!gamerxytUrl) {
      return res.status(404).json({
        success: false,
        error: "No gamerxyt link found on hubcloud page",
        hubcloud_link: hubcloudLink
      });
    }

    console.log(`[HubDrive] Step 2 done: ${gamerxytUrl}`);

    // Step 3: gamerxyt → final download links
    console.log(`[HubDrive] Step 3: ${gamerxytUrl}`);

    const gamerxytResponse = await axios.get(gamerxytUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://gamerxyt.com/',
        'Origin': 'https://gamerxyt.com'
      },
      timeout: 30000
    });

    const $ = cheerio.load(gamerxytResponse.data);

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

    if (downloadLinks.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No download links found",
        hubcloud_link: hubcloudLink,
        gamerxyt_url: gamerxytUrl,
        file_info: fileInfo
      });
    }

    res.json({
      success: true,
      original_url: hubdriveUrl,
      file_info: fileInfo,
      download_links: downloadLinks,
      total_servers: downloadLinks.length
    });

  } catch (error) {
    console.error('[HubDrive] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
