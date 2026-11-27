const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontend = path.resolve(__dirname, '../../frontend');
const serverPath = path.resolve(__dirname, '../server.js');

async function startServer(t) {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: '0', HOST: '127.0.0.1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => child.kill());
  return await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Server startup timed out: ' + output)), 5000);
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.stderr.on('data', chunk => { output += chunk; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
  });
}

test('local HTTP server serves all frontend assets and both game routes without dependencies', async t => {
  const base = await startServer(t);
  const html = fs.readFileSync(path.join(frontend, 'game.html'), 'utf8');
  for (const route of ['/', '/game', '/game/', '/game.html']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const assets = [...new Set([...html.matchAll(/(?:src|href)="(\/(?:scripts|models|sounds|textures)\/[^" ]+|\/style\.css[^" ]*)"/g)].map(match => match[1]))];
  assert.ok(assets.length >= 30);
  for (const asset of assets) {
    const response = await fetch(base + asset);
    assert.equal(response.status, 200, asset);
    const original = fs.readFileSync(path.join(frontend, asset.split('?')[0]));
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), original, asset);
    const head = await fetch(base + asset, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), original.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
  }
});

test('removed APIs, backend files and unsupported HTTP methods are unavailable', async t => {
  const base = await startServer(t);
  for (const route of ['/api/history', '/api/auth/me', '/api/health', '/ws', '/backend/server.js', '/db.json', '/Dockerfile']) {
    const response = await fetch(base + route);
    assert.equal(response.status, 404, route);
    await response.text();
  }
  const traversal = await fetch(base + '/%2e%2e%2fbackend%2fserver.js');
  assert.equal(traversal.status, 403);
  const post = await fetch(base + '/', { method: 'POST' });
  assert.equal(post.status, 405);
});

function historyContext(storage, cookie = '') {
  const sandbox = { console, document: { getElementById: () => null, cookie },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(frontend, 'scripts/state.js'), 'utf8'), sandbox);
  return sandbox;
}

test('detailed history is retained across reloads using the same browser storage key', () => {
  const storage = new Map();
  const first = historyContext(storage);
  vm.runInContext(`game.phaseHistory = [normalizeHistoryItem({id:'saved-phase',phase:2,status:'concluida',livesLeft:2,enemyHitsNeeded:3,actions:[{expectedAction:'jump',actualAction:'jump',outcome:'success',reactionTime:.52}]})]; persistPerformanceHistory();`, first);
  assert.ok(storage.has('corpus_vr_performance_history'));
  const second = historyContext(storage);
  vm.runInContext('initializePerformanceHistory()', second);
  assert.equal(vm.runInContext('game.phaseHistory[0].id', second), 'saved-phase');
  assert.equal(vm.runInContext('game.phaseHistory[0].actions[0].reactionTime', second), .52);
  assert.equal(vm.runInContext('game.phaseHistory[0].actionBreakdown.jump.hits', second), 1);
});

test('legacy cookie history remains migratable without a database', () => {
  const storage = new Map();
  const cookie = 'hb_performance_history=' + encodeURIComponent(JSON.stringify([{id:'old-phase',phase:1,livesLeft:1,enemyHitsNeeded:3}]));
  const sandbox = historyContext(storage, cookie);
  vm.runInContext('initializePerformanceHistory()', sandbox);
  assert.equal(vm.runInContext('game.phaseHistory[0].id', sandbox), 'old-phase');
  assert.ok(storage.has('corpus_vr_performance_history'));
});
