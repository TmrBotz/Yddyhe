// hdhub4u.js - HDHub4u Movie/Web Series Scraper (Only Main Download Links)
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const router = express.Router();

// HDHub4u endpoint
router.get('/', async (req, res) => {
  const movieUrl = req.query.url;
  
  if (!movieUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing 'url' parameter",
      usage: "/api/hdhub4u?url=https://new2.hdhub4u.cl/movie-name/"
    });
  }

  try {
    console.log(`[HDHub4u] Fetching: ${movieUrl}`);
    
    const response = await axios.get(movieUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://new2.hdhub4u.cl/',
        'Origin': 'https://new2.hdhub4u.cl'
      },
      timeout: 30000,
      maxRedirects: 5
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    // Extract movie info
    const movieInfo = {
      title: $('h1.page-title .material-text').text().trim() || $('title').text().trim(),
      poster: $('img.aligncenter').attr('src') || $('meta[property="og:image"]').attr('content') || '',
      categories: [],
      imdb_rating: '',
      genre: '',
      stars: '',
      director: '',
      creator: '',
      language: '',
      quality: '',
      release_date: '',
      description: '',
      episodes: ''
    };

    // Extract categories
    $('.page-meta a').each((i, el) => {
      const cat = $(el).find('.material-text').text().trim();
      if (cat) movieInfo.categories.push(cat);
    });

    // Extract metadata
    $('.mod .kno-ecr-pt, .NFQFxe .kno-ecr-pt').each((i, el) => {
      const html = $(el).html();
      if (html) {
        // Genre
        if (html.includes('Genre:')) {
          const match = html.match(/Genre:\s*([^<]+)/);
          if (match) movieInfo.genre = match[1].trim();
        }
        // Stars
        if (html.includes('Stars:')) {
          const match = html.match(/Stars:\s*([^<]+)/);
          if (match) movieInfo.stars = match[1].trim();
        }
        // Director
        if (html.includes('Director:')) {
          const match = html.match(/Director:\s*([^<]+)/);
          if (match) movieInfo.director = match[1].trim();
        }
        // Creator
        if (html.includes('Creator:')) {
          const match = html.match(/Creator:\s*([^<]+)/);
          if (match) movieInfo.creator = match[1].trim();
        }
        // Language
        if (html.includes('Language:')) {
          const match = html.match(/Language:\s*([^<]+)/);
          if (match) movieInfo.language = match[1].trim();
        }
        // Quality
        if (html.includes('Quality:')) {
          const match = html.match(/Quality:\s*([^<]+)/);
          if (match) movieInfo.quality = match[1].trim();
        }
        // No. of Episodes
        if (html.includes('No. of Episodes:')) {
          const match = html.match(/No\. of Episodes:\s*([^<]+)/);
          if (match) movieInfo.episodes = match[1].trim();
        }
      }
    });

    // Extract IMDB rating
    $('a[href*="imdb.com"]').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.match(/[\d.]+/)) {
        movieInfo.imdb_rating = text;
      }
    });

    // Extract release date
    $('.page-meta .material-text b').each((i, el) => {
      const text = $(el).text().trim();
      if (text && !movieInfo.release_date) {
        movieInfo.release_date = text;
      }
    });

    // Extract description
    $('.kno-rdesc, .mod .kno-rdesc').each((i, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 50 && !movieInfo.description) {
        movieInfo.description = text;
      }
    });

    // =============================================
    // EXTRACT ONLY MAIN DOWNLOAD LINKS
    // =============================================
    const downloadLinks = [];
    
    // Get all h3, h4 tags that contain download links
    $('h3 a, h4 a, h2 a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      const parentText = $(el).parent().text().trim();
      
      if (href && !href.includes('#') && !href.includes('javascript:')) {
        // Skip episode links (contain "EPISODE", "EP", "S", "E" pattern)
        const isEpisode = /EPISODE|EP\s|S\d{1,2}E\d{1,2}/i.test(parentText) || /EPISODE|EP\s|S\d{1,2}E\d{1,2}/i.test(text);
        
        // Skip watch links (hdstream4u.com, hubstream.art)
        const isWatch = href.includes('hdstream4u.com') || href.includes('hubstream.art');
        
        // Skip 4khdhub.one links
        const is4KHub = href.includes('4khdhub.one');
        
        // Skip if it's an episode, watch link, or 4KHub
        if (isEpisode || isWatch || is4KHub) {
          return;
        }
        
        // Check if it's a download URL (hubdrive, gadgetsweb, hubcdn, etc.)
        if (href.includes('hubdrive.tips') || 
            href.includes('gadgetsweb.xyz') || 
            href.includes('hubcdn.sbs')) {
          
          // Extract quality
          let quality = 'Unknown';
          const qualityMatch = text.match(/(\d+[pP]|4K|HEVC|x264|x265|SAMPLE|HQ|WEB-DL|SDR)/i);
          if (qualityMatch) {
            quality = qualityMatch[1];
          } else {
            // Try to extract from parent text
            const parentQualityMatch = parentText.match(/(\d+[pP]|4K|HEVC|x264|x265|SDR)/i);
            if (parentQualityMatch) {
              quality = parentQualityMatch[1];
            }
          }
          
          // Extract size
          let size = '';
          const sizeMatch = text.match(/\[([\d.]+(?:GB|MB|KB))\]/);
          if (sizeMatch) {
            size = sizeMatch[1];
          } else {
            // Try to extract from parent text
            const parentSizeMatch = parentText.match(/\[([\d.]+(?:GB|MB|KB))\]/);
            if (parentSizeMatch) {
              size = parentSizeMatch[1];
            }
          }
          
          // Check if it's a pack
          const isPack = text.toLowerCase().includes('pack') || parentText.toLowerCase().includes('pack');
          
          // Check if it's 4K
          const is4K = quality.includes('4K') || quality.includes('2160p');
          
          downloadLinks.push({
            url: href,
            quality: quality,
            size: size,
            is_pack: isPack,
            is_4k: is4K,
            server: href.includes('hubdrive.tips') ? 'HubDrive' : 
                    href.includes('gadgetsweb.xyz') ? 'GadgetsWeb' : 
                    href.includes('hubcdn.sbs') ? 'HubCDN' : 'Other',
            label: text || 'Download Link'
          });
        }
      }
    });

    // Remove duplicates based on URL
    const uniqueLinks = [];
    const seenUrls = new Set();
    for (const link of downloadLinks) {
      if (!seenUrls.has(link.url)) {
        seenUrls.add(link.url);
        uniqueLinks.push(link);
      }
    }

    // Sort links by quality (4K first, then 1080p, 720p, 480p)
    const qualityOrder = {
      '4K': 0,
      '2160p': 1,
      '1080p': 2,
      '720p': 3,
      '480p': 4,
      '360p': 5,
      'Unknown': 99
    };

    uniqueLinks.sort((a, b) => {
      const aQuality = a.quality || 'Unknown';
      const bQuality = b.quality || 'Unknown';
      return (qualityOrder[aQuality] || 99) - (qualityOrder[bQuality] || 99);
    });

    if (uniqueLinks.length === 0) {
      return res.status(404).json({
        success: false,
        error: "No main download links found on the page",
        movie_info: movieInfo
      });
    }

    // Count packs and individual links
    const packLinks = uniqueLinks.filter(link => link.is_pack);
    const individualLinks = uniqueLinks.filter(link => !link.is_pack);

    res.json({
      success: true,
      original_url: movieUrl,
      movie_info: movieInfo,
      download_links: uniqueLinks,
      summary: {
        total_links: uniqueLinks.length,
        pack_links: packLinks.length,
        individual_links: individualLinks.length,
        quality_distribution: uniqueLinks.reduce((acc, link) => {
          const quality = link.quality || 'Unknown';
          acc[quality] = (acc[quality] || 0) + 1;
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('[HDHub4u] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
