import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const transactionDuration = new Trend('transaction_duration');
const successfulTransactions = new Counter('successful_transactions');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '1m', target: 100 },  // Ramp up to 100 users
    { duration: '2m', target: 100 },  // Stay at 100 users
    { duration: '30s', target: 0 },   // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500', 'p(99)<1000'], // 95% under 500ms, 99% under 1s
    'errors': ['rate<0.05'], // Error rate under 5%
    'http_req_failed': ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test data
const USERS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
];

const ASSETS = ['GOLD', 'DIAMOND', 'LOYALTY'];

function generateIdempotencyKey() {
  return `load-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function randomUser() {
  return USERS[Math.floor(Math.random() * USERS.length)];
}

function randomAsset() {
  return ASSETS[Math.floor(Math.random() * ASSETS.length)];
}

function randomAmount() {
  return (Math.random() * 100 + 10).toFixed(2);
}

export default function () {
  const userId = randomUser();
  const assetCode = randomAsset();
  const amount = randomAmount();
  const idempotencyKey = generateIdempotencyKey();

  // Test 1: Top-up
  {
    const payload = JSON.stringify({
      userId,
      assetCode,
      amount,
      idempotencyKey: `topup-${idempotencyKey}`,
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const start = new Date();
    const res = http.post(`${BASE_URL}/wallet/topup`, payload, params);
    const duration = new Date() - start;

    const success = check(res, {
      'topup status is 200': (r) => r.status === 200,
      'topup has transaction': (r) => JSON.parse(r.body).id !== undefined,
      'topup completed': (r) => JSON.parse(r.body).status === 'COMPLETED',
    });

    errorRate.add(!success);
    transactionDuration.add(duration);
    if (success) successfulTransactions.add(1);
  }

  sleep(0.5);

  // Test 2: Check Balance
  {
    const res = http.get(`${BASE_URL}/wallet/${userId}/balance?asset=${assetCode}`);
    
    check(res, {
      'balance status is 200': (r) => r.status === 200,
      'balance has value': (r) => JSON.parse(r.body).balance !== undefined,
    });
  }

  sleep(0.5);

  // Test 3: Spend (50% probability to avoid insufficient funds)
  if (Math.random() > 0.5) {
    const spendAmount = (Math.random() * 10 + 1).toFixed(2);
    const payload = JSON.stringify({
      userId,
      assetCode,
      amount: spendAmount,
      idempotencyKey: `spend-${idempotencyKey}`,
    });

    const params = {
      headers: { 'Content-Type': 'application/json' },
    };

    const res = http.post(`${BASE_URL}/wallet/spend`, payload, params);
    
    check(res, {
      'spend status is 200 or 402': (r) => r.status === 200 || r.status === 402,
    });
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

function textSummary(data) {
  const stats = data.metrics;
  
  return `
╔══════════════════════════════════════════════════════════════════════╗
║                    WALLET SERVICE LOAD TEST RESULTS                  ║
╚══════════════════════════════════════════════════════════════════════╝

📊 Request Statistics:
  • Total Requests: ${stats.http_reqs.values.count}
  • Request Rate: ${stats.http_reqs.values.rate.toFixed(2)}/s
  • Failed Requests: ${stats.http_req_failed.values.passes || 0}
  • Error Rate: ${(stats.errors.values.rate * 100).toFixed(2)}%


⏱️  Response Times:
  • Average: ${stats.http_req_duration.values.avg.toFixed(2)}ms
  • Median (p50): ${stats.http_req_duration.values.med.toFixed(2)}ms
  • p95: ${(stats.http_req_duration.values['p(95)'] || 0).toFixed(2)}ms
  • p99: ${(stats.http_req_duration.values['p(99)'] || 0).toFixed(2)}ms
  • Max: ${stats.http_req_duration.values.max.toFixed(2)}ms


💰 Transaction Metrics:
  • Successful Transactions: ${(stats.successful_transactions && stats.successful_transactions.values.count) || 0}
  • Avg Transaction Time: ${(stats.transaction_duration && stats.transaction_duration.values.avg.toFixed(2)) || '0.00'}ms


${data.thresholds.http_req_duration.ok ? '✅' : '❌'} Performance Threshold: p95 < 500ms
${data.thresholds.errors.ok ? '✅' : '❌'} Error Rate Threshold: < 5%

═══════════════════════════════════════════════════════════════════════
`;
}
