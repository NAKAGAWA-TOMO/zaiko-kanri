const http = require('http');
const fs = require('fs');
const path = require('path');
const { InMemoryProductRepository } = require('./repository');

const PORT = process.env.PORT || 3000;
const repo = new InMemoryProductRepository([
  { name: 'ボールペン (黒)', quantity: 120 },
  { name: 'A4コピー用紙 500枚', quantity: 30 },
  { name: 'ホチキス針', quantity: 8 },
]);

// ---- バリデーション (API側) ----
function validateName(name) {
  if (typeof name !== 'string' || name.trim() === '') return '商品名は必須です';
  if (name.length > 100) return '商品名は100文字以内にしてください';
  return null;
}
function validateQuantity(q) {
  if (typeof q !== 'number' || !Number.isInteger(q)) return '数量は整数で指定してください';
  if (q < 0) return '数量は0以上にしてください (マイナス不可)';
  if (q > 1000000) return '数量は1,000,000以下にしてください';
  return null;
}

// ---- ヘルパ ----
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('invalid json')); }
    });
  });
}

async function handleApi(req, res, url) {
  const m = url.pathname.match(/^\/api\/products(?:\/(\d+))?(\/quantity)?$/);
  if (!m) return send(res, 404, { error: 'Not Found' });
  const id = m[1] ? Number(m[1]) : null;
  const isQty = !!m[2];

  try {
    // GET /api/products
    if (!id && req.method === 'GET') return send(res, 200, await repo.list());

    // POST /api/products
    if (!id && req.method === 'POST') {
      const body = await readJson(req);
      const err = validateName(body.name) || validateQuantity(body.quantity);
      if (err) return send(res, 400, { error: err });
      const name = body.name.trim();
      // 同名商品があれば新規作成せず数量を加算して統合する
      const existing = await repo.findByName(name);
      if (existing) {
        const total = existing.quantity + body.quantity;
        const qErr = validateQuantity(total);
        if (qErr) return send(res, 400, { error: `統合後の数量が上限を超えます: ${qErr}` });
        return send(res, 200, await repo.updateQuantity(existing.id, total));
      }
      return send(res, 201, await repo.create({ name, quantity: body.quantity }));
    }

    // PUT /api/products/:id/quantity
    if (id && isQty && req.method === 'PUT') {
      const body = await readJson(req);
      const err = validateQuantity(body.quantity);
      if (err) return send(res, 400, { error: err });
      const updated = await repo.updateQuantity(id, body.quantity);
      return updated ? send(res, 200, updated) : send(res, 404, { error: '商品が見つかりません' });
    }

    // DELETE /api/products/:id
    if (id && !isQty && req.method === 'DELETE') {
      const ok = await repo.delete(id);
      return ok ? send(res, 204) : send(res, 404, { error: '商品が見つかりません' });
    }

    return send(res, 405, { error: 'Method Not Allowed' });
  } catch (e) {
    if (e.message === 'invalid json') return send(res, 400, { error: 'JSONが不正です' });
    console.error(e);
    return send(res, 500, { error: 'Internal Server Error' });
  }
}

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
  if (url.pathname === '/' || url.pathname === '/index.html') {
    return fs.readFile(path.join(__dirname, 'public', 'index.html'), (err, buf) => {
      if (err) return send(res, 500, { error: 'index.html not found' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
  }
  send(res, 404, { error: 'Not Found' });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
