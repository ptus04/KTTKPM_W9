/**
 * Seed Data Grid (Redis) with sample flash sale products
 * 
 * Chạy script này để nạp dữ liệu sản phẩm vào Data Grid (Redis)
 * KHÔNG dùng database - tất cả data nằm trên Redis
 * 
 * Usage: node seed-redis.js
 */

const Redis = require('ioredis');

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
});

const products = [
  {
    id: '1',
    name: 'iPhone 15 Pro Max',
    price: '29990000',
    image: '📱',
    description: 'iPhone 15 Pro Max 256GB - Titan tự nhiên. Flash Sale giảm sốc!',
    category: 'Điện thoại',
  },
  {
    id: '2',
    name: 'Samsung Galaxy S24 Ultra',
    price: '25990000',
    image: '📱',
    description: 'Samsung Galaxy S24 Ultra 256GB - AI Phone hàng đầu.',
    category: 'Điện thoại',
  },
  {
    id: '3',
    name: 'MacBook Air M3',
    price: '27490000',
    image: '💻',
    description: 'MacBook Air 15 inch M3 chip - Mỏng nhẹ, hiệu năng cao.',
    category: 'Laptop',
  },
  {
    id: '4',
    name: 'AirPods Pro 2',
    price: '5490000',
    image: '🎧',
    description: 'AirPods Pro 2 USB-C - Chống ồn chủ động, âm thanh không gian.',
    category: 'Phụ kiện',
  },
  {
    id: '5',
    name: 'iPad Air M2',
    price: '16990000',
    image: '📋',
    description: 'iPad Air M2 11 inch - Mạnh mẽ, đa năng.',
    category: 'Tablet',
  },
  {
    id: '6',
    name: 'Apple Watch Ultra 2',
    price: '18990000',
    image: '⌚',
    description: 'Apple Watch Ultra 2 - Thể thao, GPS, dành cho phiêu lưu.',
    category: 'Đồng hồ',
  },
  {
    id: '7',
    name: 'Sony WH-1000XM5',
    price: '7490000',
    image: '🎧',
    description: 'Tai nghe Sony WH-1000XM5 - Chống ồn hàng đầu thế giới.',
    category: 'Phụ kiện',
  },
  {
    id: '8',
    name: 'Nintendo Switch OLED',
    price: '7990000',
    image: '🎮',
    description: 'Nintendo Switch OLED - Màn hình OLED 7 inch sống động.',
    category: 'Gaming',
  },
  {
    id: '9',
    name: 'Xiaomi Robot Vacuum',
    price: '8990000',
    image: '🤖',
    description: 'Robot hút bụi Xiaomi X10+ - Tự động giặt giẻ, hút mạnh.',
    category: 'Gia dụng',
  },
  {
    id: '10',
    name: 'Dell UltraSharp 27"',
    price: '12990000',
    image: '🖥️',
    description: 'Màn hình Dell UltraSharp 27 inch 4K - Chuyên đồ họa.',
    category: 'Màn hình',
  },
];

// Stock levels for each product
const stockLevels = {
  '1': 50,
  '2': 30,
  '3': 20,
  '4': 100,
  '5': 40,
  '6': 15,
  '7': 60,
  '8': 25,
  '9': 35,
  '10': 45,
};

async function seedData() {
  try {
    console.log('🔄 Clearing existing data from Data Grid...');
    
    // Clear existing product and stock data
    const existingKeys = await redis.keys('product:*');
    const stockKeys = await redis.keys('stock:*');
    const cartKeys = await redis.keys('cart:*');
    const orderKeys = await redis.keys('order:*');
    const ordersListKeys = await redis.keys('orders:*');
    
    const allKeys = [...existingKeys, ...stockKeys, ...cartKeys, ...orderKeys, ...ordersListKeys];
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
    }

    console.log('📦 Seeding products to Data Grid (Redis)...\n');

    const pipeline = redis.pipeline();

    // Seed products
    for (const product of products) {
      pipeline.hset(`product:${product.id}`, product);
      console.log(`  ✅ Product: ${product.name} (₫${parseInt(product.price).toLocaleString()})`);
    }

    // Seed stock levels
    console.log('\n📊 Seeding stock levels...\n');
    for (const [productId, stock] of Object.entries(stockLevels)) {
      pipeline.set(`stock:${productId}`, stock);
      console.log(`  📦 Product ${productId}: ${stock} units`);
    }

    await pipeline.exec();

    console.log('\n✅ Data Grid seeded successfully!');
    console.log(`   Products: ${products.length}`);
    console.log(`   Stock entries: ${Object.keys(stockLevels).length}`);
    console.log('\n💡 Data is now in Redis (Data Grid) - NO database used!');

    redis.disconnect();
  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    redis.disconnect();
    process.exit(1);
  }
}

seedData();
