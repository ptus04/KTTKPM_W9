/**
 * PU1 - Product Processing Unit
 * Port: 8081
 * 
 * Responsibilities:
 * - GET /products         → Danh sách sản phẩm từ Data Grid (Redis)
 * - GET /products/:id     → Chi tiết sản phẩm từ Data Grid (Redis)
 * 
 * Space-Based Architecture:
 * - KHÔNG đọc DB trực tiếp
 * - Tất cả dữ liệu load từ Redis (Data Grid / Memory Grid)
 */

const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 8081;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Connect to Redis (Data Grid)
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => console.log('✅ PU1-Product connected to Data Grid (Redis)'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

app.use(cors());
app.use(express.json());

// ============================================
// Local Cache (Processing Unit Cache)
// Mỗi PU có cache local để giảm round-trip tới Data Grid
// ============================================
let localCache = {
  products: null,
  lastUpdated: 0,
  TTL: 5000, // 5 seconds TTL for local cache
};

/**
 * GET /products
 * Lấy danh sách sản phẩm từ Data Grid (Redis)
 * Có local cache để tối ưu performance
 */
app.get('/products', async (req, res) => {
  try {
    const now = Date.now();

    // Check local cache first (Processing Unit cache)
    if (localCache.products && (now - localCache.lastUpdated) < localCache.TTL) {
      console.log('📦 [PU1] Serving from LOCAL CACHE');
      return res.json({
        source: 'local-cache',
        data: localCache.products,
      });
    }

    // Load from Data Grid (Redis)
    console.log('🔄 [PU1] Loading from DATA GRID (Redis)');
    const productKeys = await redis.keys('product:*');

    if (productKeys.length === 0) {
      return res.json({ source: 'data-grid', data: [] });
    }

    const pipeline = redis.pipeline();
    // Sort keys to ensure consistent ordering
    productKeys.sort().forEach((key) => pipeline.hgetall(key));
    const results = await pipeline.exec();

    const products = results
      .map(([err, data]) => {
        if (err || !data || !data.id) return null;
        return {
          id: data.id,
          name: data.name,
          price: parseFloat(data.price),
          image: data.image,
          description: data.description,
          category: data.category,
        };
      })
      .filter(Boolean);

    // Update local cache
    localCache.products = products;
    localCache.lastUpdated = now;

    res.json({
      source: 'data-grid',
      data: products,
    });
  } catch (error) {
    console.error('❌ [PU1] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /products/:id
 * Lấy chi tiết sản phẩm từ Data Grid (Redis)
 */
app.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`🔍 [PU1] Get product detail: ${id}`);

    // Load from Data Grid
    const data = await redis.hgetall(`product:${id}`);

    if (!data || !data.id) {
      return res.status(404).json({ error: 'Product not found in Data Grid' });
    }

    // Also get stock from inventory data in Data Grid
    const stock = await redis.get(`stock:${id}`);

    const product = {
      id: data.id,
      name: data.name,
      price: parseFloat(data.price),
      image: data.image,
      description: data.description,
      category: data.category,
      stock: stock ? parseInt(stock) : 0,
    };

    res.json({
      source: 'data-grid',
      data: product,
    });
  } catch (error) {
    console.error('❌ [PU1] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'OK', service: 'PU1-Product', dataGrid: 'connected' });
  } catch {
    res.status(503).json({ status: 'ERROR', service: 'PU1-Product', dataGrid: 'disconnected' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 PU1 - Product Processing Unit running on port ${PORT}`);
  console.log(`📡 Data Grid (Redis): ${REDIS_HOST}:${REDIS_PORT}`);
});
