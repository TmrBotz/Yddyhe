const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'HubDrive API',
    version: '1.0.0',
    endpoints: {
      '/api/hubdrive': 'GET - Extract hubcloud link from hubdrive URL',
      '/api/health': 'GET - Health check'
    },
    usage: '/api/hubdrive?url=https://hubdrive.tips/file/xxxxx'
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Main API endpoint
app.get('/api/hubdrive', async (req, res) => {
  const hubdriveUrl = req.query.url;
  
  // Validate URL
  if (!hubdriveUrl) {
    return res.status(400).json({
      success: false,
      error: "Missing 'url' parameter",
      usage: "/api/hubdrive?url=https://hubdrive.tips/file/xxxxx"
    });
  }

  // Validate URL format
  if (!hubdriveUrl.includes('hubdrive.tips/file/')) {
    return res.status(400).json({
      success: false,
      error: "Invalid URL format",
      message: "URL should be like: https://hubdrive.tips/file/xxxxx"
    });
  }

  try {
    console.log(`Fetching: ${hubdriveUrl}`);
    
    // Fetch the hubdrive page with proper headers
    const response = await axios.get(hubdriveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://hubdrive.tips/',
        'Origin': 'https://hubdrive.tips'
      },
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      }
    });

    // Check if response is HTML
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('text/html')) {
      return res.status(400).json({
        success: false,
        error: "Invalid response",
        message: "The URL did not return HTML content"
      });
    }

    const html = response.data;
    
    // Method 1: Using regex to extract hubcloud link
    const regexMatch = html.match(/href=['"](https:\/\/hubcloud\.cx\/drive\/[a-zA-Z0-9]+)['"]/);
    
    let hubcloudLink = null;
    
    if (regexMatch) {
      hubcloudLink = regexMatch[1];
    } else {
      // Method 2: Using Cheerio to parse HTML
      const $ = cheerio.load(html);
      
      // Find all links with hubcloud.cx
      $('a[href*="hubcloud.cx/drive/"]').each((index, element) => {
        const href = $(element).attr('href');
        if (href && href.includes('hubcloud.cx/drive/')) {
          hubcloudLink = href;
          return false; // Break loop
        }
      });
    }

    // If still not found, try alternative patterns
    if (!hubcloudLink) {
      // Try to find in any href attribute
      const altMatch = html.match(/["'](https:\/\/hubcloud\.cx\/drive\/[^"']+)["']/);
      if (altMatch) {
        hubcloudLink = altMatch[1];
      }
    }

    if (!hubcloudLink) {
      return res.status(404).json({
        success: false,
        error: "No hubcloud link found on the page",
        message: "Could not extract hubcloud link from the provided URL"
      });
    }

    // Success response
    res.json({
      success: true,
      original_url: hubdriveUrl,
      hubcloud_link: hubcloudLink,
      file_info: extractFileInfo(html)
    });

  } catch (error) {
    console.error('Error:', error.message);
    
    // Handle different error types
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({
        success: false,
        error: "Request timeout",
        message: "The request took too long to complete"
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({
        success: false,
        error: `HTTP Error: ${error.response.status}`,
        message: error.response.statusText || "Failed to fetch URL"
      });
    }
    
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error.message
    });
  }
});

// Helper function to extract file information
function extractFileInfo(html) {
  const info = {};
  
  // Extract file name
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  if (titleMatch) {
    info.file_name = titleMatch[1].replace('HubDrive | ', '');
  }
  
  // Extract file size
  const sizeMatch = html.match(/File Size<\/td>\s*<td[^>]*>([^<]+)<\/td>/);
  if (sizeMatch) {
    info.file_size = sizeMatch[1].trim();
  }
  
  // Extract file type
  const typeMatch = html.match(/File Type<\/td>\s*<td[^>]*>([^<]+)<\/td>/);
  if (typeMatch) {
    info.file_type = typeMatch[1].trim();
  }
  
  // Extract file owner
  const ownerMatch = html.match(/File Owner<\/td>\s*<td[^>]*>([^<]+)<\/td>/);
  if (ownerMatch) {
    info.file_owner = ownerMatch[1].trim();
  }
  
  return info;
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
    message: "Please use /api/hubdrive endpoint"
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 HubDrive API Server is running on port ${PORT}`);
  console.log(`📍 http://localhost:${PORT}`);
  console.log(`📖 Usage: http://localhost:${PORT}/api/hubdrive?url=https://hubdrive.tips/file/xxxxx`);
});
