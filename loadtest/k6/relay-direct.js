// relay 単体の試験(spec 008 AC-008-05)。1,000宛先の配信依頼を k6 から直接 notify-relay に送る。
// 受付の速さを k6 が測り、送り終えるまでの時間は受け取り役の数え(collect.py)で測る。
//
//   k6 run -e REQUESTS=300 -e RELAY_URL=http://localhost:8080 relay-direct.js
import http from 'k6/http';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { check } from 'k6';
import exec from 'k6/execution';

const REQUESTS = Number(__ENV.REQUESTS || 300);
const PER_REQUEST = 1000;
const RELAY_URL = __ENV.RELAY_URL || 'http://localhost:8080';
// compose.yaml の notify-relay と同じ、ローカル専用の公開済みのダミーの鍵
const KEY_ID = __ENV.RELAY_KEY_ID || 'local';
const KEY = encoding.b64decode(__ENV.RELAY_KEY_B64 || 'bG9jYWwtZGV2LXJlbGF5LXNpZ25pbmcta2V5LTAwMDE=');
const RUN = __ENV.RUN_ID || `${Date.now()}`;

export const options = {
  scenarios: {
    // 依頼を出す側の並びは10本。全体の試験で worker が依頼を出すのに近い形にする
    deliveries: { executor: 'shared-iterations', vus: 10, iterations: REQUESTS, maxDuration: '20m' },
  },
  thresholds: {
    // 目標(AC-008-05)。満たさなくても試験は最後まで動かし、数字を残す
    'http_req_duration{name:create_delivery}': [{ threshold: 'p(95)<300', abortOnFail: false }],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

export default function () {
  // 試験全体での通し番号(0 から REQUESTS-1)。__ITER は VU ごとの番号なので使わない
  const n = exec.scenario.iterationInTest;
  const recipients = [];
  for (let i = 0; i < PER_REQUEST; i++) {
    recipients.push({ recipient_ref: `r${n}-${i}`, email: `relay-${RUN}-${n}-${i}@loadtest.invalid` });
  }
  const path = '/v1/deliveries';
  const body = JSON.stringify({
    dedupe_key: `loadtest:${RUN}:${n}`,
    tenant_ref: `loadtest:${n % 1000}`,
    message: { subject: '負荷試験', text: '負荷試験のメールです。実在の人には届きません。' },
    recipients,
  });
  const ts = Math.floor(Date.now() / 1000);
  const signature = 'v1=' + crypto.hmac('sha256', KEY, `${ts}.POST.${path}.${body}`, 'hex');
  const res = http.post(`${RELAY_URL}${path}`, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Relay-Key-Id': KEY_ID,
      'X-Relay-Timestamp': `${ts}`,
      'X-Relay-Signature': signature,
    },
    tags: { name: 'create_delivery' },
  });
  if (!check(res, { 'accepted (202)': (r) => r.status === 202 })) {
    // 断られた理由を残す(本文は notify-relay のエラーの説明だけで、宛先は含まない)
    console.warn(`request ${n}: ${res.status} ${String(res.body).slice(0, 300)}`);
  }
}
