// Local dev server: static files + /api/chat (same handler Vercel runs) + a mock LLM at /mock/v1.
process.env.ALLOW_LOCAL = '1';
const http = require('http');
const fs = require('fs');
const path = require('path');
const chat = require('../api/chat.js');
const models = require('../api/models.js');
const { reply } = require('./mock-llm.js');

const PUB = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const PORT = process.env.PORT || 3000;

function readBody(req) {
  return new Promise((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(b)); });
}

http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/chat') {
    const raw = await readBody(req);
    req.body = raw ? JSON.parse(raw) : {};
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return chat(req, res);
  }
  if (url === '/api/models') {
    const raw = await readBody(req);
    req.body = raw ? JSON.parse(raw) : {};
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    return models(req, res);
  }
  if (url === '/mock/v1/models') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: 'mock' }, { id: 'mock-2' }] })); }
  if (url === '/mock/v1/chat/completions') {
    const body = JSON.parse(await readBody(req));
    await new Promise((r) => setTimeout(r, 150));
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ choices: [{ message: { content: reply(body.messages) }, finish_reason: 'stop' }], usage: { total_tokens: 100 } }));
  }
  const file = path.join(PUB, url === '/' ? 'index.html' : url);
  if (!file.startsWith(PUB) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`MiroFish-Lite dev server: http://localhost:${PORT}  (mock model: http://localhost:${PORT}/mock/v1)`));
