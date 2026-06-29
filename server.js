const express = require('express');
const cors = require('cors');

const hubdriveRouter = require('./routes/hubdrive');
const gadgetswebRouter = require('./routes/gadgetsweb');
const hubcdnRouter = require('./routes/hubcdn');


const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/hubdrive', hubdriveRouter);
app.use('/api/gadgetsweb', gadgetswebRouter);
app.use('/api/hubcdn', hubcdnRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/', (req, res) => {
  res.json({
    service: 'ScrapCloud API',
    endpoints: [
      'GET /api/hubdrive?url=...',
      'GET /api/gadgetsweb?url=...',
      'GET /api/health'
    ]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
