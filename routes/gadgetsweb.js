// gadgetsweb.js - Complete GadgetsWeb scraper with multi-level redirect handling
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();

function extractRedirectUrl(html) {
  let match = html.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
  if (match) return match[1];
  
  match = html.match(/setTimeout\s*\(\s*\(\)\s*=>\s*\{?\s*window\.location\.href\s*=\s*['"]([^'"]+)['"]/);
  if (match) return match[1];
  
  match = html.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
  if (match) return match[1];
  
  match = html.match(/<meta\s+http-equiv=["']refresh["']\s+content=["']\d+;\s*url=([^'"]+)["']/i);
  if (match) return match[1];
  
  match = html.match(/<a\s+[^>]*href=['"]([^'"]+)['"][^>]*>.*?(?:Download|Link|Click here).*?<\/a>/i);
  if (match) return match[1];
  
  return null;
}

async function fetchWithRedirects(url, depth = 0, visited = new Set(), chain = []) {
  const MAX_DEPTH = 10;
  
  if (depth > MAX_DEPTH) throw new Error('Too many redirects (max 10)');
  if (visited.has(url)) throw new Error(`Redirect loop detected: ${url}`);
  
  visited.add(url);
  chain.push(url);
  console.log(`[Fetch] Depth ${depth}: ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'max-age=0'
      },
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 500
    });

    // HTTP 3xx redirect
    if (response.status >= 300 && response.status < 400) {
      const loc = response.headers.location;
      if (loc) {
        const absoluteUrl = loc.startsWith('http') ? loc : new URL(loc, url).href;
        console.log(`[Fetch] HTTP redirect to: ${absoluteUrl}`);
        return await fetchWithRedirects(absoluteUrl, depth + 1, visited, chain);
      }
    }

    const html = response.data;

    // JS redirect
    const jsRedirect = extractRedirectUrl(html);
    if (jsRedirect && (html.includes('Redirecting') || html.includes('window.location') || html.includes('location.href'))) {
      const absoluteUrl = jsRedirect.startsWith('http') ? jsRedirect : new URL(jsRedirect, url).href;
      console.log(`[Fetch] JS redirect to: ${absoluteUrl}`);
      return await fetchWithRedirects(absoluteUrl, depth + 1, visited, chain);
    }

    // Cheerio link scan
    const $ = cheerio.load(html);
    let finalLink = null;

    $('a[href*="hblinks.co"], a[href*="download"], a[href*="link"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().toLowerCase();
      if (href &&
          !href.includes('gadgetsweb.xyz') &&
          !href.includes('greenmountmotors.com') &&
          !href.includes('javascript:') &&
          (text.includes('download') || text.includes('link') || text.includes('click') || href.includes('hblinks.co'))) {
        finalLink = href;
        return false;
      }
    });

    if (finalLink) {
      const absoluteUrl = finalLink.startsWith('http') ? finalLink : new URL(finalLink, url).href;
      console.log(`[Fetch] Found final link: ${absoluteUrl}`);
      return await fetchWithRedirects(absoluteUrl, depth + 1, visited, chain);
    }

    // Attach chain + final URL to response object
    response._finalUrl = url;
    response._chain = chain;
    return response;

  } catch (error) {
    console.error(`[Fetch] Error: ${error.message}`);
    throw error;
  }
}

router.get('/', async (req, res) => {
  const gadgetswebUrl = req.query.url;

  if (!gadgetswebUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing 'url' parameter",
      usage: "/api/gadgetsweb?url=https://gadgetsweb.xyz/?id=xxxxx"
    });
  }

  try {
    console.log(`[GadgetsWeb] Starting fetch: ${gadgetswebUrl}`);
    const response = await fetchWithRedirects(gadgetswebUrl);
    const html = response.data;
    const finalUrl = response._finalUrl || gadgetswebUrl;
    const chain = response._chain || [];

    console.log(`[GadgetsWeb] Final URL: ${finalUrl}`);
    const $ = cheerio.load(html);

    // File info extraction
    let fileName = $('title').text().trim() || 'Unknown File';
    let fileSize = '';
    let fileType = '';
    let shareDate = '';

    $('h1, h2, h3, .title, .post-title, .entry-title').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 5) { fileName = text; return false; }
    });

    if (fileName === 'Unknown File') {
      const metaTitle = $('meta[property="og:title"]').attr('content');
      if (metaTitle) fileName = metaTitle;
    }

    $('li:contains("File Size"), .file-size, [class*="size"], td:contains("File Size"), p:contains("File Size")').each((i, el) => {
      const sizeMatch = $(el).text().match(/File Size\s*[:]?\s*([\d.]+)\s*(GB|MB|KB)/i);
      if (sizeMatch) { fileSize = sizeMatch[1] + ' ' + sizeMatch[2]; return false; }
    });

    $('li:contains("File Type"), .file-type, [class*="type"], td:contains("File Type"), p:contains("File Type")').each((i, el) => {
      const typeMatch = $(el).text().match(/File Type\s*[:]?\s*(.+)/i);
      if (typeMatch) { fileType = typeMatch[1].trim(); return false; }
    });

    $('li:contains("Share Date"), .share-date, [class*="date"], td:contains("Share Date"), p:contains("Share Date")').each((i, el) => {
      const dateMatch = $(el).text().match(/Share Date\s*[:]?\s*(.+)/i);
      if (dateMatch) { shareDate = dateMatch[1].trim(); return false; }
    });

    const downloadLinks = [];

    // Video/Archive direct links
    $('a[href*=".mkv"], a[href*=".mp4"], a[href*=".avi"], a[href*=".mov"], a[href*=".wmv"], a[href*=".flv"], a[href*=".webm"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.includes('gadgetsweb.xyz') && !href.includes('javascript:')) {
        downloadLinks.push({ url: href, server: 'Video Download', label: $(el).text().trim() || 'Download Video' });
      }
    });

    $('a[href*=".rar"], a[href*=".zip"], a[href*=".7z"], a[href*=".tar"], a[href*=".gz"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !href.includes('gadgetsweb.xyz') && !href.includes('javascript:')) {
        downloadLinks.push({ url: href, server: 'Archive Download', label: $(el).text().trim() || 'Download Archive' });
      }
    });

    // Download buttons
    $('a.btn, a[class*="download"], a[class*="button"], a[class*="dl"], a:contains("Download")').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && !href.includes('gadgetsweb.xyz') && !href.includes('javascript:') && !downloadLinks.some(l => l.url === href)) {
        downloadLinks.push({ url: href, server: 'Download Button', label: text || 'Download' });
      }
    });

    // External links
    const skipDomains = ['gadgetsweb.xyz', 'greenmountmotors.com', 'javascript:', 'twitter.com', 'facebook.com', 'youtube.com', 'instagram.com', 't.me', 'telegram', 'whatsapp'];
    $('a[href*="http"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && !skipDomains.some(d => href.includes(d)) && !downloadLinks.some(l => l.url === href) &&
          (text.toLowerCase().includes('download') || text.toLowerCase().includes('link') || href.includes('hblinks.co') || href.includes('download'))) {
        downloadLinks.push({ url: href, server: 'External Download', label: text || 'Download Link' });
      }
    });

    if (downloadLinks.length === 0 && finalUrl) {
      downloadLinks.push({ url: finalUrl, server: 'Final Page', label: fileName || 'Link' });
    }

    res.json({
      success: true,
      original_url: gadgetswebUrl,
      final_url: finalUrl,
      redirect_chain: chain,
      file_info: {
        name: fileName,
        size: fileSize || 'Unknown Size',
        type: fileType || 'Unknown Type',
        share_date: shareDate || 'Unknown Date'
      },
      download_links: downloadLinks,
      total_servers: downloadLinks.length
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
