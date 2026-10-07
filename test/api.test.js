// APIの自動テスト。実行: node --test test/
// テストごとに server.js を別ポートで起動するため、本番用サーバー(3000)を止めずに実行できる。
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = `http://localhost:${PORT}/api/products`;
let server;

before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  // 起動完了のログ(http://localhost:PORT)が出るまで待つ
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.once('exit', (c) => reject(new Error(`server exited early (${c})`)));
    server.stdout.on('data', (d) => { if (String(d).includes('http://')) resolve(); });
  });
});

after(() => { server.kill(); });

async function call(method, url, body, raw) {
  const res = await fetch(url, {
    method,
    headers: body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const post = (body) => call('POST', BASE, body);
const put = (id, body) => call('PUT', `${BASE}/${id}/quantity`, body);
const del = (id) => call('DELETE', `${BASE}/${id}`);
const list = async () => (await call('GET', BASE)).body;

test('一覧: 初期データが3件ある', async () => {
  const r = await call('GET', BASE);
  assert.equal(r.status, 200);
  assert.equal(r.body.length, 3);
  assert.deepEqual(r.body.map((p) => p.quantity), [120, 30, 8]);
});

test('追加: 正常は201、前後の空白は除去して保存', async () => {
  const r = await post({ name: '  追加テスト  ', quantity: 5 });
  assert.equal(r.status, 201);
  assert.equal(r.body.name, '追加テスト');
  assert.equal(r.body.quantity, 5);
  await del(r.body.id);
});

test('追加: 入力不正は400', async () => {
  const cases = [
    ['数量マイナス', { name: 'x', quantity: -1 }],
    ['商品名なし', { quantity: 1 }],
    ['商品名が空白のみ', { name: '   ', quantity: 1 }],
    ['商品名が101文字', { name: 'あ'.repeat(101), quantity: 1 }],
    ['数量が小数', { name: 'x', quantity: 1.5 }],
    ['数量が文字列', { name: 'x', quantity: '3' }],
    ['数量が上限超え', { name: 'x', quantity: 1000001 }],
  ];
  for (const [label, body] of cases) {
    const r = await post(body);
    assert.equal(r.status, 400, label);
    assert.equal(typeof r.body.error, 'string', label);
  }
});

test('追加: 不正JSONは400', async () => {
  const r = await call('POST', BASE, undefined, '{bad');
  assert.equal(r.status, 400);
});

test('追加: 境界値(商品名100文字・数量0・数量1,000,000)は許可', async () => {
  for (const body of [
    { name: 'あ'.repeat(100), quantity: 0 },
    { name: '上限テスト', quantity: 1000000 },
  ]) {
    const r = await post(body);
    assert.equal(r.status, 201);
    await del(r.body.id);
  }
});

test('同名統合: 空白・全角半角・大文字小文字を無視して数量を加算', async () => {
  const first = await post({ name: 'Stapler ABC', quantity: 10 });
  assert.equal(first.status, 201);
  const before = (await list()).length;

  const merged = await post({ name: '　ｓｔａｐｌｅｒ　ａｂｃ ', quantity: 5 });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.id, first.body.id);
  assert.equal(merged.body.quantity, 15);
  assert.equal(merged.body.name, 'Stapler ABC'); // 最初の表記が残る
  assert.equal((await list()).length, before); // 行は増えない

  await del(first.body.id);
});

test('同名統合: 加算後が上限を超える場合は400で、数量は変わらない', async () => {
  const first = await post({ name: '統合上限テスト', quantity: 999999 });
  const r = await post({ name: '統合上限テスト', quantity: 2 });
  assert.equal(r.status, 400);
  const item = (await list()).find((p) => p.id === first.body.id);
  assert.equal(item.quantity, 999999);
  await del(first.body.id);
});

test('数量変更: 正常・0は許可', async () => {
  const c = await post({ name: '数量変更テスト', quantity: 1 });
  assert.equal((await put(c.body.id, { quantity: 20 })).status, 200);
  const r = await put(c.body.id, { quantity: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.body.quantity, 0);
  await del(c.body.id);
});

test('数量変更: 入力不正は400、存在しないIDは404', async () => {
  const c = await post({ name: '数量不正テスト', quantity: 1 });
  assert.equal((await put(c.body.id, { quantity: -5 })).status, 400);
  assert.equal((await put(c.body.id, {})).status, 400);
  assert.equal((await put(c.body.id, { quantity: null })).status, 400);
  assert.equal((await put(c.body.id, { quantity: 1.5 })).status, 400);
  assert.equal((await put(99999, { quantity: 1 })).status, 404);
  await del(c.body.id);
});

test('削除: 204、再削除は404、一覧から消える', async () => {
  const c = await post({ name: '削除テスト', quantity: 1 });
  assert.equal((await del(c.body.id)).status, 204);
  assert.equal((await del(c.body.id)).status, 404);
  assert.ok(!(await list()).some((p) => p.id === c.body.id));
});

test('idは削除しても再利用されない', async () => {
  const a = await post({ name: 'id確認A', quantity: 1 });
  await del(a.body.id);
  const b = await post({ name: 'id確認B', quantity: 1 });
  assert.ok(b.body.id > a.body.id);
  await del(b.body.id);
});

test('非対応メソッドは405、存在しないパスは404', async () => {
  assert.equal((await call('PATCH', `${BASE}/1`)).status, 405);
  assert.equal((await call('GET', 'http://localhost:' + PORT + '/api/unknown')).status, 404);
});
