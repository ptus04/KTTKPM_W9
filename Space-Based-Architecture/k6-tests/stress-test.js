/**
 * K6 Stress Test — Flash Sale System
 * 
 * Test khả năng chịu tải cực cao (1000+ req/s)
 * Mô phỏng đợt Flash Sale với hàng trăm user đổ vào cùng lúc
 * 
 * Chạy: k6 run stress-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const reqDuration = new Trend('req_duration');

const BASE = {
  PU1: 'http://host.docker.internal:8081',
  PU2: 'http://host.docker.internal:8082',
  PU3: 'http://host.docker.internal:8083',
  PU4: 'http://host.docker.internal:8084',
};

export const options = {
  scenarios: {
    // Stress test: đẩy lên 500 users
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5s',  target: 100 },
        { duration: '10s', target: 300 },
        { duration: '15s', target: 500 },  // Peak: 500 concurrent users
        { duration: '10s', target: 500 },  // Hold peak
        { duration: '5s',  target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],  // 95% < 1s
    http_req_failed: ['rate<0.1'],      // < 10% failures
    errors: ['rate<0.15'],
  },
};

export default function () {
  const userId = `stress_${__VU}_${__ITER}`;
  const productId = Math.floor(Math.random() * 10) + 1;

  // Rapid fire: load products
  let res = http.get(`${BASE.PU1}/products`);
  reqDuration.add(res.timings.duration);
  let ok = check(res, { 'products OK': (r) => r.status === 200 });
  errorRate.add(!ok);

  // Add to cart
  res = http.post(`${BASE.PU2}/cart/add`, JSON.stringify({
    userId, productId: String(productId), quantity: 1,
    name: `Product ${productId}`, price: 1000000, image: '📱',
  }), { headers: { 'Content-Type': 'application/json' } });
  reqDuration.add(res.timings.duration);
  ok = check(res, { 'cart add OK': (r) => r.status === 200 });
  errorRate.add(!ok);

  // Checkout
  res = http.post(`${BASE.PU3}/checkout`, JSON.stringify({ userId }), {
    headers: { 'Content-Type': 'application/json' },
  });
  reqDuration.add(res.timings.duration);
  ok = check(res, { 'checkout OK': (r) => r.status === 200 || r.status === 400 });
  errorRate.add(!ok);

  // Check stock
  res = http.get(`${BASE.PU4}/stock/${productId}`);
  reqDuration.add(res.timings.duration);
  ok = check(res, { 'stock OK': (r) => r.status === 200 });
  errorRate.add(!ok);

  sleep(0.1);
}
