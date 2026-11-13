// 配信の最中の API の試験(spec 008 AC-008-07)。loadtest:seed が書き出したログイン済みのセッションで、
// 利用者の主な操作を続ける。全体の試験と同時に動かし、配信がないときの値とも比べる。
// 配信の前はお知らせがまだ公開されていないので、表示と配信状況は配信の最中にしか呼ばれない。
// 前と最中の比較は、両方にある操作(home・notices・roster)で行う。名簿は選手のいない条件(seed が
// 選手を作らない)で、実際より軽い。
//
//   k6 run -e SESSIONS=/path/sessions.json -e API_URL=http://localhost:8000 -e DURATION=10m api-during-delivery.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const API_URL = __ENV.API_URL || 'http://localhost:8000';
const sessions = new SharedArray('sessions', () => JSON.parse(open(__ENV.SESSIONS)));

export const options = {
  scenarios: {
    // 1人あたり、2秒ごとに1つの画面を開く利用者を VUS 人
    users: { executor: 'constant-vus', vus: Number(__ENV.VUS || 50), duration: __ENV.DURATION || '10m' },
  },
  // 目標(AC-008-07)。満たさなくても試験は最後まで動かし、数字を残す。操作ごとにも書くと、
  // k6 が操作ごとの p95 と失敗の割合を集計して summary に出す
  thresholds: Object.fromEntries([
    ['http_req_duration', ['p(95)<300']],
    ['http_req_failed', ['rate<0.01']],
    ...['home', 'notices', 'notice', 'status', 'roster'].flatMap((name) => [
      [`http_req_duration{name:${name}}`, ['p(95)<300']],
      [`http_req_failed{name:${name}}`, ['rate<0.01']],
    ]),
  ]),
  summaryTrendStats: ['avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// 画面と同じ道筋(Origin・Referer が web のもの。Sanctum の SPA の Cookie 認証)
function get(s, path, name) {
  return http.get(`${API_URL}${path}`, {
    headers: { Accept: 'application/json', Origin: 'http://localhost:5173', Referer: 'http://localhost:5173/' },
    cookies: { [s.cookie_name]: { value: s.cookie_value, replace: true } },
    tags: { name },
  });
}

export default function () {
  const s = sessions[(__VU - 1) % sessions.length];
  const team = `/api/teams/${s.team_id}`;
  const home = get(s, team, 'home');
  check(home, { 'home 200': (r) => r.status === 200 });
  sleep(2);
  const list = get(s, `${team}/notices`, 'notices');
  check(list, { 'notices 200': (r) => r.status === 200 });
  sleep(2);
  let noticeId = null;
  try {
    const items = list.json('notices');
    if (Array.isArray(items) && items.length > 0) noticeId = items[0].id;
  } catch (_) {
    // 一覧が取れなかったときは、表示と配信状況を飛ばす(失敗は上の check で数える)
  }
  if (noticeId !== null) {
    check(get(s, `${team}/notices/${noticeId}`, 'notice'), { 'notice 200': (r) => r.status === 200 });
    sleep(2);
    if (s.role === 'representative') {
      check(get(s, `${team}/notices/${noticeId}/status`, 'status'), { 'status 200': (r) => r.status === 200 });
      sleep(2);
    }
  }
  if (s.role === 'representative') {
    check(get(s, `${team}/players`, 'roster'), { 'roster 200': (r) => r.status === 200 });
    sleep(2);
  }
}
