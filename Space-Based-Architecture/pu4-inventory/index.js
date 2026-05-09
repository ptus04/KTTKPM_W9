/**
 * PU4 - Inventory Processing Unit
 * Port: 8084
 * 
 * Responsibilities:
 * - GET /stock/:productId  → Xem tồn kho
 * - PUT /stock/:productId  → Cập nhật tồn kho (admin)
 * - GET /stock             → Xem toàn bộ tồn kho
 * 
 * Space-Based Architecture:
 * - Tồn kho lưu trên Data Grid (Redis)
 * - Giảm stock trực tiếp trên Data Grid
 * - KHÔNG gọi DB
 */

const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 8084;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Connect to Redis (Data Grid)
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => console.log('✅ PU4-Inventory connected to Data Grid (Redis)'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

app.use(cors());
app.use(express.json());

/**
 * GET /stock/:productId
 * Lấy tồn kho sản phẩm từ Data Grid
 */
app.get('/stock/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    console.log(`📊 [PU4] Check stock for product: ${productId}`);

    const stock = await redis.get(`stock:${productId}`);

    if (stock === null) {
      return res.status(404).json({ error: 'Product not found in inventory' });
    }

    res.json({
      source: 'data-grid',
      data: {
        productId,
        stock: parseInt(stock),
        lastChecked: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ [PU4] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /stock
 * Lấy toàn bộ tồn kho từ Data Grid
 */
app.get('/stock', async (req, res) => {
  try {
    console.log('📊 [PU4] Get all stock');

    const stockKeys = await redis.keys('stock:*');

    if (stockKeys.length === 0) {
      return res.json({ source: 'data-grid', data: [] });
    }

    const pipeline = redis.pipeline();
    stockKeys.forEach((key) => pipeline.get(key));
    const results = await pipeline.exec();

    const inventory = stockKeys.map((key, index) => ({
      productId: key.replace('stock:', ''),
      stock: parseInt(results[index][1]) || 0,
    }));

    res.json({
      source: 'data-grid',
      data: inventory,
    });
  } catch (error) {
    console.error('❌ [PU4] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PUT /stock/:productId
 * Cập nhật tồn kho trên Data Grid
 * Body: { stock: number }
 */
app.put('/stock/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { stock } = req.body;

    if (stock === undefined || stock < 0) {
      return res.status(400).json({ error: 'Valid stock value is required' });
    }

    console.log(`📝 [PU4] Update stock: product=${productId}, stock=${stock}`);

    await redis.set(`stock:${productId}`, stock);

    res.json({
      source: 'data-grid',
      message: 'Stock updated',
      data: { productId, stock: parseInt(stock) },
    });
  } catch (error) {
    console.error('❌ [PU4] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /stock/decrement
 * Giảm tồn kho (được gọi từ Order PU khi checkout)
 * Body: { productId, quantity }
 */
app.post('/stock/decrement', async (req, res) => {
  try {
    const { productId, quantity = 1 } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    console.log(`📉 [PU4] Decrement stock: product=${productId}, qty=${quantity}`);

    // Atomic decrement trên Data Grid
    const newStock = await redis.decrby(`stock:${productId}`, quantity);

    if (newStock < 0) {
      // Rollback if went negative
      await redis.incrby(`stock:${productId}`, quantity);
      return res.status(400).json({
        error: 'Insufficient stock',
        data: { productId, currentStock: newStock + quantity },
      });
    }

    res.json({
      source: 'data-grid',
      message: 'Stock decremented',
      data: { productId, newStock },
    });
  } catch (error) {
    console.error('❌ [PU4] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /health
 */
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'OK', service: 'PU4-Inventory', dataGrid: 'connected' });
  } catch {
    res.status(503).json({ status: 'ERROR', service: 'PU4-Inventory', dataGrid: 'disconnected' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 PU4 - Inventory Processing Unit running on port ${PORT}`);
  console.log(`📡 Data Grid (Redis): ${REDIS_HOST}:${REDIS_PORT}`);
});
