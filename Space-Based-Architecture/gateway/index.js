/**
 * API Gateway — Flash Sale System
 * Port: 8080
 * 
 * Vai trò:
 * - Điểm vào duy nhất cho Frontend
 * - Route request tới đúng Processing Unit
 * - Logging & monitoring tập trung
 * - Rate limiting (chống spam)
 * 
 * Routing:
 *   /api/products/**  → PU1 Product  (:8081)
 *   /api/cart/**      → PU2 Cart     (:8082)
 *   /api/checkout     → PU3 Order    (:8083)
 *   /api/orders/**    → PU3 Order    (:8083)
 *   /api/stock/**     → PU4 Inventory(:8084)
 *   /api/health       → Health check tất cả PU
 */

const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 8080;

// Processing Unit addresses
const PU = {
  PRODUCT:   process.env.PU1_URL || 'http://localhost:8081',
  CART:      process.env.PU2_URL || 'http://localhost:8082',
  ORDER:     process.env.PU3_URL || 'http://localhost:8083',
  INVENTORY: process.env.PU4_URL || 'http://localhost:8084',
};

app.use(cors());

// ============= Request Logging =============
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const color = res.statusCode < 400 ? '\x1b[32m' : '\x1b[31m';
    console.log(
      `${color}${req.method}\x1b[0m ${req.originalUrl} → ${res.statusCode} (${duration}ms)`
    );
  });
  next();
});

// ============= Simple Rate Limiting =============
const rateMap = new Map();
const RATE_LIMIT = 100;   // max requests
const RATE_WINDOW = 10000; // per 10 seconds

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const record = rateMap.get(ip);

  if (!record || now - record.start > RATE_WINDOW) {
    rateMap.set(ip, { start: now, count: 1 });
    return next();
  }

  record.count++;
  if (record.count > RATE_LIMIT) {
    return res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit: ${RATE_LIMIT} requests per ${RATE_WINDOW / 1000}s`,
    });
  }
  next();
}

app.use(rateLimiter);

// Clean up rate map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateMap) {
    if (now - record.start > RATE_WINDOW) rateMap.delete(ip);
  }
}, 30000);

// ============= Proxy Options Factory =============
function proxyTo(target, pathRewrite) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (err, req, res) => {
        console.error(`❌ Proxy error → ${target}:`, err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: 'Service unavailable', target });
        }
      },
    },
  });
}

// ============= Route → Processing Units =============

// PU1 - Product Processing Unit
app.use('/api/products', proxyTo(PU.PRODUCT, { '^/api/products': '/products' }));

// PU2 - Cart Processing Unit
app.use('/api/cart', proxyTo(PU.CART, { '^/api/cart': '/cart' }));

// PU3 - Order Processing Unit
app.use('/api/checkout', proxyTo(PU.ORDER, { '^/api/checkout': '/checkout' }));
app.use('/api/orders', proxyTo(PU.ORDER, { '^/api/orders': '/orders' }));

// PU4 - Inventory Processing Unit
app.use('/api/stock', proxyTo(PU.INVENTORY, { '^/api/stock': '/stock' }));

// ============= Gateway Health Check =============
app.get('/api/health', async (req, res) => {
  const results = {};

  for (const [name, url] of Object.entries(PU)) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const r = await fetch(`${url}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      results[name] = r.ok ? 'UP' : 'DOWN';
    } catch {
      results[name] = 'DOWN';
    }
  }

  const allUp = Object.values(results).every((s) => s === 'UP');
  res.status(allUp ? 200 : 207).json({
    gateway: 'UP',
    services: results,
    timestamp: new Date().toISOString(),
  });
});

// ============= Gateway Info =============
app.get('/api/info', (req, res) => {
  res.json({
    service: 'API Gateway',
    architecture: 'Space-Based Architecture',
    routes: {
      '/api/products/**': `→ PU1 Product (${PU.PRODUCT})`,
      '/api/cart/**':     `→ PU2 Cart (${PU.CART})`,
      '/api/checkout':    `→ PU3 Order (${PU.ORDER})`,
      '/api/orders/**':   `→ PU3 Order (${PU.ORDER})`,
      '/api/stock/**':    `→ PU4 Inventory (${PU.INVENTORY})`,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

app.listen(PORT, () => {
  console.log(`\n🌐 API Gateway running on port ${PORT}`);
  console.log(`\n📡 Routing table:`);
  console.log(`   /api/products/**  → PU1 Product   (${PU.PRODUCT})`);
  console.log(`   /api/cart/**      → PU2 Cart      (${PU.CART})`);
  console.log(`   /api/checkout     → PU3 Order     (${PU.ORDER})`);
  console.log(`   /api/orders/**    → PU3 Order     (${PU.ORDER})`);
  console.log(`   /api/stock/**     → PU4 Inventory (${PU.INVENTORY})`);
  console.log(`   /api/health       → All PU health check`);
  console.log(`\n⚡ Rate limit: ${RATE_LIMIT} req / ${RATE_WINDOW / 1000}s per IP\n`);
});
