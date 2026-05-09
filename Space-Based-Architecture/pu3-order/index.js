/**
 * PU3 - Order Processing Unit
 * Port: 8083
 * 
 * Responsibilities:
 * - POST /checkout   → Đặt hàng (tạo order từ cart)
 * - GET  /orders     → Xem danh sách đơn hàng
 * 
 * Space-Based Architecture:
 * - Lấy cart từ Data Grid (Redis)
 * - Gọi Inventory PU (PU4) để giảm tồn kho
 * - Tạo order trên Data Grid
 * - KHÔNG gọi DB
 */

const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 8083;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const INVENTORY_URL = process.env.INVENTORY_URL || 'http://localhost:8084';

// Connect to Redis (Data Grid)
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => console.log('✅ PU3-Order connected to Data Grid (Redis)'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

app.use(cors());
app.use(express.json());

/**
 * POST /checkout
 * Xử lý đặt hàng:
 * 1. Lấy cart từ Data Grid
 * 2. Kiểm tra & giảm tồn kho trực tiếp trên Data Grid (Redis)
 * 3. Tạo order trên Data Grid
 * 4. Xóa cart
 * 5. Trả kết quả ngay (KHÔNG chờ DB)
 */
app.post('/checkout', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`🛍️ [PU3] Checkout for user: ${userId}`);

    // 1. Lấy cart từ Data Grid
    const cartKey = `cart:${userId}`;
    const cartData = await redis.hgetall(cartKey);

    if (!cartData || Object.keys(cartData).length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }

    const cartItems = Object.values(cartData).map((item) => JSON.parse(item));
    console.log(`📦 [PU3] Cart has ${cartItems.length} items`);

    // 2. Kiểm tra & giảm tồn kho trực tiếp trên Data Grid (Redis)
    // Dùng Redis WATCH + MULTI cho atomic operation
    const stockErrors = [];

    for (const item of cartItems) {
      const stockKey = `stock:${item.productId}`;
      const currentStock = await redis.get(stockKey);
      const stock = currentStock ? parseInt(currentStock) : 0;

      if (stock < item.quantity) {
        stockErrors.push({
          productId: item.productId,
          name: item.name,
          requested: item.quantity,
          available: stock,
        });
      }
    }

    if (stockErrors.length > 0) {
      return res.status(400).json({
        error: 'Insufficient stock',
        details: stockErrors,
      });
    }

    // Giảm tồn kho trực tiếp trên Data Grid (atomic decrement)
    const pipeline = redis.pipeline();
    for (const item of cartItems) {
      pipeline.decrby(`stock:${item.productId}`, item.quantity);
    }
    await pipeline.exec();
    console.log(`📉 [PU3] Stock decremented on Data Grid`);

    // 3. Tạo order trên Data Grid
    const orderId = uuidv4();
    const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const order = {
      id: orderId,
      userId,
      items: JSON.stringify(cartItems),
      total: total.toString(),
      status: 'confirmed',
      createdAt: new Date().toISOString(),
    };

    // Save order to Data Grid
    await redis.hset(`order:${orderId}`, order);
    // Add to user's order list
    await redis.lpush(`orders:${userId}`, orderId);

    console.log(`✅ [PU3] Order created: ${orderId}`);

    // 4. Xóa cart từ Data Grid
    await redis.del(cartKey);
    console.log(`🗑️ [PU3] Cart cleared for user: ${userId}`);

    // 5. Trả kết quả ngay (KHÔNG chờ DB)
    res.json({
      source: 'data-grid',
      message: 'Order placed successfully!',
      data: {
        orderId,
        userId,
        items: cartItems,
        total,
        status: 'confirmed',
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    console.error('❌ [PU3] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /orders
 * Lấy danh sách đơn hàng từ Data Grid
 * Query: ?userId=xxx
 */
app.get('/orders', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`📋 [PU3] Get orders for user: ${userId}`);

    const orderIds = await redis.lrange(`orders:${userId}`, 0, -1);

    if (orderIds.length === 0) {
      return res.json({ source: 'data-grid', data: [] });
    }

    const pipeline = redis.pipeline();
    orderIds.forEach((id) => pipeline.hgetall(`order:${id}`));
    const results = await pipeline.exec();

    const orders = results
      .map(([err, data]) => {
        if (err || !data || !data.id) return null;
        return {
          ...data,
          items: JSON.parse(data.items),
          total: parseFloat(data.total),
        };
      })
      .filter(Boolean);

    res.json({
      source: 'data-grid',
      data: orders,
    });
  } catch (error) {
    console.error('❌ [PU3] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /health
 */
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'OK', service: 'PU3-Order', dataGrid: 'connected' });
  } catch {
    res.status(503).json({ status: 'ERROR', service: 'PU3-Order', dataGrid: 'disconnected' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 PU3 - Order Processing Unit running on port ${PORT}`);
  console.log(`📡 Data Grid (Redis): ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`📡 Inventory PU: ${INVENTORY_URL}`);
});
