/**
 * PU2 - Cart Processing Unit
 * Port: 8082
 * 
 * Responsibilities:
 * - POST /cart/add    → Thêm sản phẩm vào giỏ hàng
 * - GET  /cart        → Xem giỏ hàng
 * - DELETE /cart/:productId → Xóa sản phẩm khỏi giỏ
 * - DELETE /cart      → Xóa toàn bộ giỏ hàng
 * 
 * Space-Based Architecture:
 * - Giỏ hàng lưu trên Data Grid (Redis)
 * - KHÔNG dùng DB
 * - Session-based cart (userId)
 */

const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');

const app = express();
const PORT = process.env.PORT || 8082;
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

// Connect to Redis (Data Grid)
const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => console.log('✅ PU2-Cart connected to Data Grid (Redis)'));
redis.on('error', (err) => console.error('❌ Redis error:', err.message));

app.use(cors());
app.use(express.json());

/**
 * POST /cart/add
 * Thêm sản phẩm vào giỏ hàng trên Data Grid
 * Body: { userId, productId, quantity, name, price, image }
 */
app.post('/cart/add', async (req, res) => {
  try {
    const { userId, productId, quantity = 1, name, price, image } = req.body;

    if (!userId || !productId) {
      return res.status(400).json({ error: 'userId and productId are required' });
    }

    const cartKey = `cart:${userId}`;
    console.log(`🛒 [PU2] Adding to cart: user=${userId}, product=${productId}, qty=${quantity}`);

    // Check if item already exists in cart
    const existingItem = await redis.hget(cartKey, productId);

    if (existingItem) {
      // Update quantity
      const item = JSON.parse(existingItem);
      item.quantity += quantity;
      await redis.hset(cartKey, productId, JSON.stringify(item));
      console.log(`📝 [PU2] Updated quantity: ${item.quantity}`);
    } else {
      // Add new item
      const cartItem = {
        productId,
        name: name || `Product ${productId}`,
        price: price || 0,
        image: image || '',
        quantity,
        addedAt: Date.now(),
      };
      await redis.hset(cartKey, productId, JSON.stringify(cartItem));
      console.log(`➕ [PU2] New item added to cart`);
    }

    // Set TTL for cart (1 hour)
    await redis.expire(cartKey, 3600);

    // Return updated cart
    const cart = await getCartItems(cartKey);
    res.json({
      source: 'data-grid',
      message: 'Item added to cart',
      data: cart,
    });
  } catch (error) {
    console.error('❌ [PU2] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /cart
 * Lấy giỏ hàng từ Data Grid
 * Query: ?userId=xxx
 */
app.get('/cart', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const cartKey = `cart:${userId}`;
    console.log(`📋 [PU2] Get cart for user: ${userId}`);

    const cart = await getCartItems(cartKey);

    res.json({
      source: 'data-grid',
      data: cart,
    });
  } catch (error) {
    console.error('❌ [PU2] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /cart/:productId
 * Xóa sản phẩm khỏi giỏ hàng
 * Query: ?userId=xxx
 */
app.delete('/cart/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const cartKey = `cart:${userId}`;
    console.log(`🗑️ [PU2] Remove from cart: user=${userId}, product=${productId}`);

    await redis.hdel(cartKey, productId);

    const cart = await getCartItems(cartKey);
    res.json({
      source: 'data-grid',
      message: 'Item removed from cart',
      data: cart,
    });
  } catch (error) {
    console.error('❌ [PU2] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /cart
 * Xóa toàn bộ giỏ hàng
 * Query: ?userId=xxx
 */
app.delete('/cart', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const cartKey = `cart:${userId}`;
    console.log(`🧹 [PU2] Clear cart for user: ${userId}`);

    await redis.del(cartKey);

    res.json({
      source: 'data-grid',
      message: 'Cart cleared',
      data: { items: [], total: 0, count: 0 },
    });
  } catch (error) {
    console.error('❌ [PU2] Error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Helper: Lấy items trong giỏ hàng từ Data Grid
 */
async function getCartItems(cartKey) {
  const cartData = await redis.hgetall(cartKey);
  const items = Object.values(cartData).map((item) => JSON.parse(item));

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return { items, total, count };
}

/**
 * GET /health
 */
app.get('/health', async (req, res) => {
  try {
    await redis.ping();
    res.json({ status: 'OK', service: 'PU2-Cart', dataGrid: 'connected' });
  } catch {
    res.status(503).json({ status: 'ERROR', service: 'PU2-Cart', dataGrid: 'disconnected' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 PU2 - Cart Processing Unit running on port ${PORT}`);
  console.log(`📡 Data Grid (Redis): ${REDIS_HOST}:${REDIS_PORT}`);
});
