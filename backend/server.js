const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Only serve the game and its static assets; all game data stays in the browser.
const PUBLIC_DIR = path.resolve(__dirname, '..', 'frontend');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg'
};

function reply(req, res, status, message, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  res.end(req.method === 'HEAD' ? undefined : message);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return reply(req, res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return reply(req, res, 400, 'Bad request');
  }
  if (['/', '/game', '/game/'].includes(pathname)) pathname = '/game.html';
  // Only expose the frontend, never the backend or project files.
  if (pathname.includes('\\') || pathname.includes('\0')) {
    return reply(req, res, 400, 'Bad request');
  }
  const file = path.resolve(PUBLIC_DIR, '.' + pathname);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    return reply(req, res, 403, 'Forbidden');
  }
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) return reply(req, res, 404, 'Not found');
    const extension = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff',
      // Revalidate source files so an updated local project is not masked by old scripts.
      'Cache-Control': ['.html', '.js', '.css'].includes(extension) ? 'no-store' : 'public, max-age=3600'
    });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch {
    if (!res.headersSent) reply(req, res, 404, 'Not found');
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  const address = server.address();
  const host = address.family === 'IPv6' ? `[${address.address}]` : address.address;
  console.log(`Corpus disponível em http://${host}:${address.port}`);
  if (address.address === '127.0.0.1') console.log(`Abra http://localhost:${address.port} no navegador.`);
});
