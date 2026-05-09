/**
 * K6 Spike Test — Flash Sale System
 * 
 * Mô phỏng tình huống spike: đột ngột 1000 users đổ vào
 * (giống lúc Flash Sale bắt đầu)
 * 
 * Chạy: k6 run spike-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

const BASE = {
  PU1: 'http://host.docker.internal:8081',
  PU2: 'http://host.docker.internal:8082',
  PU3: 'http://host.docker.internal:8083',
  PU4: 'http://host.docker.internal:8084',
};

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2s',  target: 10 },    // Warm up
        { duration: '3s',  target: 500 },   // SPIKE! 🚀
        { duration: '10s', target: 500 },   // Hold spike
        { duration: '3s',  target: 10 },    // Drop
        { duration: '5s',  target: 0 },     // Cool down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.15'],
  },
};

export default function () {
  const userId = `spike_${__VU}_${__ITER}`;
  const productId = String(Math.floor(Math.random() * 10) + 1);

  // Quick buy flow: view → add → checkout
  const res1 = http.get(`${BASE.PU1}/products/${productId}`);
  errorRate.add(!check(res1, { 'view OK': (r) => r.status === 200 }));

  const res2 = http.post(`${BASE.PU2}/cart/add`, JSON.stringify({
    userId, productId, quantity: 1,
    name: `Product ${productId}`, price: 1000000, image: '📱',
  }), { headers: { 'Content-Type': 'application/json' } });
  errorRate.add(!check(res2, { 'cart OK': (r) => r.status === 200 }));

  const res3 = http.post(`${BASE.PU3}/checkout`, JSON.stringify({ userId }), {
    headers: { 'Content-Type': 'application/json' },
  });
  errorRate.add(!check(res3, { 'checkout OK': (r) => r.status === 200 || r.status === 400 }));

  sleep(0.1);
}
