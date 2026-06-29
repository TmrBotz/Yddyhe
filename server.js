// server.js - Complete flow: hubdrive → hubcloud → gamerxyt → download links
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Main endpoint: Complete flow
app.get('/api/hubdrive', async (req, res) => {
  const hubdriveUrl = req.query.url;
  
  if (!hubdriveUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing 'url' parameter",
      usage: "/api/hubdrive?url=https://hubdrive.tips/file/xxxxx"
    });
  }

  try {
    // Step 1: Get hubcloud link from hubdrive
    console.log(`Step 1: Fetching hubdrive: ${hubdriveUrl}`);
    
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

    const hubdriveHtml = hubdriveResponse.data;
    const hubcloudMatch = hubdriveHtml.match(/href=['"](https:\/\/hubcloud\.cx\/drive\/[a-zA-Z0-9]+)['"]/);
    
    if (!hubcloudMatch) {
      return res.status(404).json({
        success: false,
        error: "No hubcloud link found on hubdrive page"
      });
    }

    const hubcloudLink = hubcloudMatch[1];
    console.log(`Step 1: Found hubcloud link: ${hubcloudLink}`);

    // Step 2: Get gamerxyt link from hubcloud
    console.log(`Step 2: Fetching hubcloud: ${hubcloudLink}`);
    
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
    
    // Extract gamerxyt link - multiple methods
    let gamerxytUrl = null;
    
    // Method 1: From anchor tag with id "download"
    const downloadMatch = hubcloudHtml.match(/id="download"\s+href=['"](https:\/\/gamerxyt\.com\/hubcloud\.php[^'"]+)['"]/);
    if (downloadMatch) {
      gamerxytUrl = downloadMatch[1];
    }
    
    // Method 2: From any href with gamerxyt.com
    if (!gamerxytUrl) {
      const gamerxytMatch = hubcloudHtml.match(/href=['"](https:\/\/gamerxyt\.com\/hubcloud\.php[^'"]+)['"]/);
      if (gamerxytMatch) {
        gamerxytUrl = gamerxytMatch[1];
      }
    }
    
    // Method 3: From JavaScript variable
    if (!gamerxytUrl) {
      const jsMatch = hubcloudHtml.match(/var\s+url\s*=\s*['"](https:\/\/gamerxyt\.com\/hubcloud\.php[^'"]+)['"]/);
      if (jsMatch) {
        gamerxytUrl = jsMatch[1];
      }
    }
    
    if (!gamerxytUrl) {
      return res.status(404).json({
        success: false,
        error: "No gamerxyt link found on hubcloud page",
        hubcloud_link: hubcloudLink
      });
    }
    
    console.log(`Step 2: Found gamerxyt link: ${gamerxytUrl}`);

    // Step 3: Get final download links from gamerxyt
    console.log(`Step 3: Fetching gamerxyt: ${gamerxytUrl}`);
    
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

    const gamerxytHtml = gamerxytResponse.data;
    const $ = cheerio.load(gamerxytHtml);
    
    // Extract file info
    const fileInfo = {
      name: $('.card-header.text-white').text().trim() || $('title').text().trim(),
      size: $('#size').text().trim() || $('li:contains("File Size") i').text().trim(),
      type: $('li:contains("File Type") i').text().trim(),
      share_date: $('#date').text().trim() || $('li:contains("Share Date") i').text().trim()
    };

    // Extract all download links
    const downloadLinks = [];
    
    // 1. FSLv2 Server (id="s3")
    const fslv2 = $('#s3');
    if (fslv2.length) {
      const href = fslv2.attr('href');
      if (href) {
        downloadLinks.push({
          url: href,
          server: 'FSLv2 Server',
          label: 'Download [FSLv2 Server]'
        });
      }
    }

    // 2. FSL Server (id="fsl")
    const fsl = $('#fsl');
    if (fsl.length) {
      const href = fsl.attr('href');
      if (href) {
        downloadLinks.push({
          url: href,
          server: 'FSL Server',
          label: 'Download [FSL Server]'
        });
      }
    }

    // 3. 10Gbps Server (btn-danger)
    $('a.btn-danger').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && href.includes('gpdl.hubcloud.cx')) {
        downloadLinks.push({
          url: href,
          server: '10Gbps Server',
          label: text || 'Download [Server : 10Gbps]',
          note: 'Resume Not Supported'
        });
      }
    });

    // 4. PixelServer (id="pxl-1")
    const pixel = $('#pxl-1');
    if (pixel.length) {
      const href = pixel.attr('href');
      const text = pixel.text().trim();
      if (href && href.includes('pixeldrain.dev')) {
        downloadLinks.push({
          url: href,
          server: 'PixelServer',
          label: text || 'Download [PixelServer : 2]'
        });
      }
    }

    // 5. Telegram link
    $('a[href*="hubcloud.cx/tg/go"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href) {
        downloadLinks.push({
          url: href,
          server: 'Telegram',
          label: text || 'Download From Telegram'
        });
      }
    });

    // 6. Any other download links (fallback)
    $('a[href*=".mkv"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      // Skip if already added
      if (href && !downloadLinks.some(link => link.url === href)) {
        downloadLinks.push({
          url: href,
          server: 'Additional Server',
          label: text || 'Download Link'
        });
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

    // Final response
    res.json({
      success: true,
      original_url: hubdriveUrl,
      file_info: fileInfo,
      download_links: downloadLinks,
      total_servers: downloadLinks.length
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`\n📖 Usage:`);
  console.log(`  GET /api/hubdrive?url=https://hubdrive.tips/file/xxxxx`);
});
