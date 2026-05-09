/**
 * K6 Load Test — Flash Sale System
 * 
 * Test toàn bộ luồng: Xem sản phẩm → Thêm giỏ hàng → Checkout
 * Mô phỏng nhiều user cùng mua Flash Sale
 * 
 * Cài K6:  winget install grafana.k6
 * Chạy:    k6 run load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// ============= Custom Metrics =============
const checkoutSuccess = new Counter('checkout_success');
const checkoutFail = new Counter('checkout_fail');
const errorRate = new Rate('errors');
const productLoadTime = new Trend('product_load_time');
const cartAddTime = new Trend('cart_add_time');
const checkoutTime = new Trend('checkout_time');

// ============= Config =============
const BASE = {
  PU1: 'http://host.docker.internal:8081',
  PU2: 'http://host.docker.internal:8082',
  PU3: 'http://host.docker.internal:8083',
  PU4: 'http://host.docker.internal:8084',
};

const HEADERS = { 'Content-Type': 'application/json' };

// ============= Test Scenarios =============
export const options = {
  scenarios: {
    // Kịch bản 1: Ramp-up từ từ
    ramp_up: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },   // Ramp lên 50 users trong 10s
        { duration: '20s', target: 100 },  // Tăng lên 100 users
        { duration: '30s', target: 200 },  // Đỉnh 200 users
        { duration: '10s', target: 0 },    // Cool down
      ],
      gracefulRampDown: '5s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],      // 95% requests < 500ms
    http_req_failed: ['rate<0.05'],        // < 5% lỗi
    errors: ['rate<0.1'],                  // < 10% error rate
    product_load_time: ['p(95)<300'],      // Load sản phẩm < 300ms
    checkout_time: ['p(95)<1000'],         // Checkout < 1s
  },
};

// ============= Main Test Flow =============
export default function () {
  const userId = `k6_user_${__VU}_${__ITER}`;

  // 1. Xem danh sách sản phẩm (PU1)
  group('1. Load Products', () => {
    const res = http.get(`${BASE.PU1}/products`);
    productLoadTime.add(res.timings.duration);

    const success = check(res, {
      'products: status 200': (r) => r.status === 200,
      'products: has data': (r) => {
        const body = r.json();
        return body.data && body.data.length > 0;
      },
    });
    errorRate.add(!success);
  });

  sleep(0.5);

  // 2. Xem chi tiết sản phẩm ngẫu nhiên (PU1)
  const productId = Math.floor(Math.random() * 10) + 1;
  group('2. View Product Detail', () => {
    const res = http.get(`${BASE.PU1}/products/${productId}`);

    const success = check(res, {
      'detail: status 200': (r) => r.status === 200,
      'detail: has product': (r) => r.json().data && r.json().data.id,
    });
    errorRate.add(!success);
  });

  sleep(0.3);

  // 3. Kiểm tra tồn kho (PU4)
  group('3. Check Stock', () => {
    const res = http.get(`${BASE.PU4}/stock/${productId}`);

    check(res, {
      'stock: status 200': (r) => r.status === 200,
      'stock: has value': (r) => r.json().data && r.json().data.stock >= 0,
    });
  });

  sleep(0.3);

  // 4. Thêm vào giỏ hàng (PU2)
  group('4. Add to Cart', () => {
    const payload = JSON.stringify({
      userId: userId,
      productId: String(productId),
      quantity: 1,
      name: `Product ${productId}`,
      price: 1000000,
      image: '📱',
    });

    const res = http.post(`${BASE.PU2}/cart/add`, payload, { headers: HEADERS });
    cartAddTime.add(res.timings.duration);

    const success = check(res, {
      'cart add: status 200': (r) => r.status === 200,
      'cart add: item added': (r) => r.json().data && r.json().data.count > 0,
    });
    errorRate.add(!success);
  });

  sleep(0.3);

  // 5. Xem giỏ hàng (PU2)
  group('5. View Cart', () => {
    const res = http.get(`${BASE.PU2}/cart?userId=${userId}`);

    check(res, {
      'cart: status 200': (r) => r.status === 200,
      'cart: has items': (r) => r.json().data && r.json().data.items.length > 0,
    });
  });

  sleep(0.3);

  // 6. Checkout (PU3) — Luồng quan trọng nhất
  group('6. Checkout', () => {
    const payload = JSON.stringify({ userId: userId });
    const res = http.post(`${BASE.PU3}/checkout`, payload, { headers: HEADERS });
    checkoutTime.add(res.timings.duration);

    const success = check(res, {
      'checkout: status 200': (r) => r.status === 200,
      'checkout: order created': (r) => {
        if (r.status === 200) {
          return r.json().data && r.json().data.orderId;
        }
        return false;
      },
    });

    if (success) {
      checkoutSuccess.add(1);
    } else {
      checkoutFail.add(1);
    }
    errorRate.add(!success);
  });

  sleep(1);
}

// ============= Summary =============
export function handleSummary(data) {
  const summary = {
    '⚡ FLASH SALE - K6 Load Test Results': '',
    '---': '',
    'Total Requests': data.metrics.http_reqs ? data.metrics.http_reqs.values.count : 0,
    'Avg Response Time': data.metrics.http_req_duration
      ? `${data.metrics.http_req_duration.values.avg.toFixed(2)}ms`
      : 'N/A',
    'p95 Response Time': data.metrics.http_req_duration
      ? `${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms`
      : 'N/A',
    'Checkout Success': data.metrics.checkout_success
      ? data.metrics.checkout_success.values.count
      : 0,
    'Checkout Fail': data.metrics.checkout_fail
      ? data.metrics.checkout_fail.values.count
      : 0,
  };

  console.log('\n========================================');
  console.log('  ⚡ FLASH SALE - Load Test Summary');
  console.log('========================================');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log('========================================\n');

  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'load-test-result.json': JSON.stringify(data, null, 2),
  };
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
