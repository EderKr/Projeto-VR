const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  DB_PATH,
  ensureLocalDbFile,
  getDatabaseStatus,
  getHistory,
  saveHistory,
  replaceHistory
} = require("./database");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const HISTORY_LIMIT = 12;
const ACTION_TYPES = ["attack", "dodgeLeft", "dodgeRight", "duck"];

function getBaseHeaders(extraHeaders = {}) {
  return {
    "Access-Control-Allow-Origin": CORS_ORIGIN,
    "Access-Control-Allow-Methods": "GET,POST,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer-when-downgrade",
    ...extraHeaders
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, getBaseHeaders({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }));
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, payload, contentType) {
  res.writeHead(statusCode, getBaseHeaders({
    "Content-Type": contentType,
    "Cache-Control": contentType.includes("text/html") ? "no-cache" : "public, max-age=3600"
  }));
  if (res.req && res.req.method === "HEAD") {
    res.end();
    return;
  }
  res.end(payload);
}

function getMimeType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "application/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".mp3": return "audio/mpeg";
    case ".ico": return "image/x-icon";
    default: return "application/octet-stream";
  }
}

function safePublicPath(requestPath) {
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const absolutePath = path.join(PUBLIC_DIR, relativePath);
  const normalizedRoot = path.resolve(PUBLIC_DIR) + path.sep;
  const normalizedFile = path.resolve(absolutePath);

  if (!normalizedFile.startsWith(normalizedRoot)) return null;
  return normalizedFile;
}

function parseMaybeInfinite(value) {
  if (value === "INF" || value === Infinity) return Infinity;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createEmptyActionStats() {
  return {
    attempts: 0,
    hits: 0,
    misses: 0,
    timeouts: 0,
    wrongActions: 0,
    accuracy: 0,
    avgReaction: null
  };
}

function normalizeActionItem(rawItem, phaseFallback = 1, index = 0) {
  if (!rawItem || typeof rawItem !== "object") return null;

  const expectedAction = ACTION_TYPES.includes(rawItem.expectedAction) ? rawItem.expectedAction : "attack";
  const actualAction = rawItem.actualAction == null ? null : String(rawItem.actualAction).slice(0, 40);
  const reactionTimeValue = rawItem.reactionTime == null ? null : Number(rawItem.reactionTime);
  const createdAt = new Date(rawItem.createdAt);
  const outcome = rawItem.outcome === "success" || rawItem.outcome === "miss" || rawItem.outcome === "timeout"
    ? rawItem.outcome
    : (rawItem.correct ? "success" : (actualAction == null ? "timeout" : "miss"));

  return {
    id: String(rawItem.id || `${Date.now()}-${phaseFallback}-${index}`).slice(0, 80),
    phase: Number.isFinite(Number(rawItem.phase)) && Number(rawItem.phase) > 0 ? Number(rawItem.phase) : phaseFallback,
    expectedAction,
    actualAction,
    source: String(rawItem.source || "unknown").slice(0, 40),
    outcome,
    correct: outcome === "success",
    reactionTime: Number.isFinite(reactionTimeValue) && reactionTimeValue >= 0 ? reactionTimeValue : null,
    createdAt: Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : new Date().toISOString()
  };
}

function buildActionBreakdown(actions) {
  const breakdown = {};

  for (const actionType of ACTION_TYPES) {
    breakdown[actionType] = createEmptyActionStats();
  }

  for (const action of actions) {
    const actionType = ACTION_TYPES.includes(action.expectedAction) ? action.expectedAction : "attack";
    const bucket = breakdown[actionType];

    bucket.attempts += 1;

    if (action.outcome === "success") {
      bucket.hits += 1;
      if (Number.isFinite(action.reactionTime)) {
        bucket.avgReaction = bucket.avgReaction == null
          ? action.reactionTime
          : bucket.avgReaction + action.reactionTime;
      }
      continue;
    }

    bucket.misses += 1;
    if (action.outcome === "timeout") {
      bucket.timeouts += 1;
    } else {
      bucket.wrongActions += 1;
    }
  }

  for (const actionType of ACTION_TYPES) {
    const bucket = breakdown[actionType];
    if (bucket.hits > 0 && bucket.avgReaction != null) {
      bucket.avgReaction = bucket.avgReaction / bucket.hits;
    } else {
      bucket.avgReaction = null;
    }

    bucket.accuracy = bucket.attempts > 0 ? (bucket.hits / bucket.attempts) * 100 : 0;
  }

  return breakdown;
}

function normalizeActionBreakdown(rawBreakdown) {
  const normalized = {};

  for (const actionType of ACTION_TYPES) {
    const rawStats = rawBreakdown && typeof rawBreakdown === "object" ? rawBreakdown[actionType] : null;
    const attempts = Math.max(0, Number(rawStats && rawStats.attempts) || 0);
    const hits = Math.max(0, Number(rawStats && rawStats.hits) || 0);
    const misses = Math.max(0, Number(rawStats && rawStats.misses) || 0);
    const timeouts = Math.max(0, Number(rawStats && rawStats.timeouts) || 0);
    const wrongActions = Math.max(0, Number(rawStats && rawStats.wrongActions) || 0);
    const avgReactionValue = rawStats && rawStats.avgReaction == null ? null : Number(rawStats && rawStats.avgReaction);

    normalized[actionType] = {
      attempts,
      hits,
      misses,
      timeouts,
      wrongActions,
      accuracy: attempts > 0 ? (hits / attempts) * 100 : 0,
      avgReaction: Number.isFinite(avgReactionValue) && avgReactionValue >= 0 ? avgReactionValue : null
    };
  }

  return normalized;
}

function normalizeHistoryItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") return null;

  const phase = Number.isFinite(Number(rawItem.phase)) && Number(rawItem.phase) > 0 ? Number(rawItem.phase) : 1;
  const difficultyPhase = Number.isFinite(Number(rawItem.difficultyPhase)) && Number(rawItem.difficultyPhase) > 0
    ? Number(rawItem.difficultyPhase)
    : phase;
  const status = rawItem.status === "concluida" || rawItem.status === "derrota" || rawItem.status === "interrompida"
    ? rawItem.status
    : "interrompida";
  const livesLeft = parseMaybeInfinite(rawItem.livesLeft);
  const enemyHitsNeeded = parseMaybeInfinite(rawItem.enemyHitsNeeded);
  const parsedCreatedAt = new Date(rawItem.createdAt);
  const actions = Array.isArray(rawItem.actions)
    ? rawItem.actions.map((item, index) => normalizeActionItem(item, phase, index)).filter(Boolean)
    : [];

  return {
    id: String(rawItem.id || `${Date.now()}-${phase}`).slice(0, 80),
    phase,
    customMode: Boolean(rawItem.customMode),
    difficultyPhase,
    status,
    livesLeft: Number.isFinite(livesLeft) ? livesLeft : Infinity,
    enemyHits: Math.max(0, Number(rawItem.enemyHits) || 0),
    enemyHitsNeeded: Number.isFinite(enemyHitsNeeded) ? Math.max(1, enemyHitsNeeded) : Infinity,
    hits: Math.max(0, Number(rawItem.hits) || 0),
    misses: Math.max(0, Number(rawItem.misses) || 0),
    attempts: Math.max(0, Number(rawItem.attempts) || 0),
    accuracy: Math.max(0, Math.min(100, Number(rawItem.accuracy) || 0)),
    duration: Math.max(0, Number(rawItem.duration) || 0),
    avgReaction: rawItem.avgReaction == null ? null : Math.max(0, Number(rawItem.avgReaction) || 0),
    actions,
    actionBreakdown: actions.length > 0 ? buildActionBreakdown(actions) : normalizeActionBreakdown(rawItem.actionBreakdown),
    createdAt: Number.isFinite(parsedCreatedAt.getTime()) ? parsedCreatedAt.toISOString() : new Date().toISOString()
  };
}

function serializeActionItem(item) {
  return {
    id: item.id,
    phase: item.phase,
    expectedAction: item.expectedAction,
    actualAction: item.actualAction,
    source: item.source,
    outcome: item.outcome,
    correct: Boolean(item.correct),
    reactionTime: item.reactionTime == null ? null : Number(item.reactionTime.toFixed(3)),
    createdAt: item.createdAt
  };
}

function serializeActionBreakdown(breakdown) {
  const result = {};

  for (const actionType of ACTION_TYPES) {
    const stats = breakdown && breakdown[actionType] ? breakdown[actionType] : createEmptyActionStats();
    result[actionType] = {
      attempts: stats.attempts,
      hits: stats.hits,
      misses: stats.misses,
      timeouts: stats.timeouts,
      wrongActions: stats.wrongActions,
      accuracy: Number((stats.accuracy || 0).toFixed(2)),
      avgReaction: stats.avgReaction == null ? null : Number(stats.avgReaction.toFixed(3))
    };
  }

  return result;
}

function serializeHistoryItem(item) {
  return {
    id: item.id,
    phase: item.phase,
    customMode: item.customMode,
    difficultyPhase: item.difficultyPhase,
    status: item.status,
    livesLeft: item.livesLeft === Infinity ? "INF" : item.livesLeft,
    enemyHits: item.enemyHits,
    enemyHitsNeeded: item.enemyHitsNeeded === Infinity ? "INF" : item.enemyHitsNeeded,
    hits: item.hits,
    misses: item.misses,
    attempts: item.attempts,
    accuracy: Number(item.accuracy.toFixed(2)),
    duration: Number(item.duration.toFixed(2)),
    avgReaction: item.avgReaction == null ? null : Number(item.avgReaction.toFixed(3)),
    actions: Array.isArray(item.actions) ? item.actions.map(serializeActionItem) : [],
    actionBreakdown: serializeActionBreakdown(item.actionBreakdown),
    createdAt: item.createdAt
  };
}

function createAggregateActionStats() {
  return {
    attempts: 0,
    hits: 0,
    misses: 0,
    timeouts: 0,
    wrongActions: 0,
    reactionSamples: 0,
    reactionTotal: 0,
    accuracy: 0,
    avgReaction: null,
    timeoutRate: 0,
    missRate: 0
  };
}

function buildHistoryInsights(entries) {
  const byAction = {};
  let totalAttempts = 0;
  let totalHits = 0;
  let totalMisses = 0;
  let totalTimeouts = 0;
  let reactionSamples = 0;
  let reactionTotal = 0;

  for (const actionType of ACTION_TYPES) {
    byAction[actionType] = createAggregateActionStats();
  }

  const latest = entries.length > 0 ? entries[0] : null;

  for (const entry of entries) {
    if (!Array.isArray(entry.actions)) continue;

    for (const action of entry.actions) {
      const actionType = ACTION_TYPES.includes(action.expectedAction) ? action.expectedAction : "attack";
      const bucket = byAction[actionType];

      bucket.attempts += 1;
      totalAttempts += 1;

      if (action.outcome === "success") {
        bucket.hits += 1;
        totalHits += 1;

        if (Number.isFinite(action.reactionTime)) {
          bucket.reactionSamples += 1;
          bucket.reactionTotal += action.reactionTime;
          reactionSamples += 1;
          reactionTotal += action.reactionTime;
        }
      } else {
        bucket.misses += 1;
        totalMisses += 1;

        if (action.outcome === "timeout") {
          bucket.timeouts += 1;
          totalTimeouts += 1;
        } else {
          bucket.wrongActions += 1;
        }
      }
    }
  }

  for (const actionType of ACTION_TYPES) {
    const bucket = byAction[actionType];
    bucket.accuracy = bucket.attempts > 0 ? (bucket.hits / bucket.attempts) * 100 : 0;
    bucket.timeoutRate = bucket.attempts > 0 ? (bucket.timeouts / bucket.attempts) * 100 : 0;
    bucket.missRate = bucket.attempts > 0 ? (bucket.misses / bucket.attempts) * 100 : 0;
    bucket.avgReaction = bucket.reactionSamples > 0 ? bucket.reactionTotal / bucket.reactionSamples : null;

    delete bucket.reactionSamples;
    delete bucket.reactionTotal;
  }

  return {
    sampleSize: entries.length,
    totals: {
      attempts: totalAttempts,
      hits: totalHits,
      misses: totalMisses,
      timeouts: totalTimeouts,
      overallAccuracy: totalAttempts > 0 ? (totalHits / totalAttempts) * 100 : 0,
      overallAvgReaction: reactionSamples > 0 ? reactionTotal / reactionSamples : null
    },
    byAction,
    latestEntry: latest ? {
      id: latest.id,
      phase: latest.phase,
      status: latest.status,
      createdAt: latest.createdAt,
      accuracy: latest.accuracy,
      avgReaction: latest.avgReaction,
      actionBreakdown: latest.actionBreakdown
    } : null
  };
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => {
      chunks.push(chunk);
      if (Buffer.concat(chunks).length > 1e6) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

async function handleHistoryGet(res) {
  const entries = await getHistory();
  sendJson(res, 200, entries.map((item) => normalizeHistoryItem(item)).filter(Boolean));
}

async function handleHistoryInsightsGet(res) {
  const entries = await getHistory();
  const normalizedEntries = entries.map((item) => normalizeHistoryItem(item)).filter(Boolean);
  sendJson(res, 200, buildHistoryInsights(normalizedEntries));
}

async function handleHistoryPost(req, res) {
  const body = await collectRequestBody(req);
  const entry = normalizeHistoryItem(body);

  if (!entry) {
    sendJson(res, 400, { error: "Invalid history entry" });
    return;
  }

  const savedEntry = await saveHistory(entry);
  sendJson(res, 201, normalizeHistoryItem(savedEntry) || entry);
}

async function handleHistoryImport(req, res) {
  const body = await collectRequestBody(req);
  const entries = Array.isArray(body.entries) ? body.entries : [];

  const normalizedEntries = entries.map((item) => normalizeHistoryItem(item)).filter(Boolean).slice(0, HISTORY_LIMIT);
  const savedEntries = await replaceHistory(normalizedEntries);
  sendJson(res, 200, savedEntries.map((item) => normalizeHistoryItem(item)).filter(Boolean));
}

function serveStaticFile(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    sendText(res, 200, data, getMimeType(filePath));
  } catch (error) {
    sendText(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, getBaseHeaders());
    res.end();
    return;
  }

  if (requestUrl.pathname === "/api/health" && (req.method === "GET" || req.method === "HEAD")) {
    getDatabaseStatus()
      .then((database) => sendJson(res, 200, {
        ok: true,
        service: "headbutt-berserker",
        timestamp: new Date().toISOString(),
        database
      }))
      .catch((error) => sendJson(res, 200, {
        ok: true,
        service: "headbutt-berserker",
        timestamp: new Date().toISOString(),
        database: { connected: false, error: error.message }
      }));
    return;
  }

  if (requestUrl.pathname === "/api/history" && req.method === "GET") {
    handleHistoryGet(res).catch((error) => sendJson(res, 500, { error: error.message }));
    return;
  }

  if (requestUrl.pathname === "/api/history/insights" && req.method === "GET") {
    handleHistoryInsightsGet(res).catch((error) => sendJson(res, 500, { error: error.message }));
    return;
  }

  if (requestUrl.pathname === "/api/history" && req.method === "POST") {
    handleHistoryPost(req, res).catch((error) => sendJson(res, 500, { error: error.message }));
    return;
  }

  if (requestUrl.pathname === "/api/history/import" && req.method === "POST") {
    handleHistoryImport(req, res).catch((error) => sendJson(res, 500, { error: error.message }));
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const safePath = safePublicPath(requestUrl.pathname);
  if (!safePath) {
    sendText(res, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  let filePath = safePath;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    const fallbackPath = path.join(PUBLIC_DIR, "index.html");
    if (requestUrl.pathname.startsWith("/scripts/") || requestUrl.pathname.endsWith(".js") || requestUrl.pathname.endsWith(".css")) {
      sendText(res, 404, "Not found", "text/plain; charset=utf-8");
      return;
    }
    serveStaticFile(res, fallbackPath);
    return;
  }

  serveStaticFile(res, filePath);
});

server.listen(PORT, HOST, () => {
  ensureLocalDbFile();
  console.log(`Headbutt Berserker server running at http://${HOST}:${PORT}`);
  console.log(`Database fallback path: ${DB_PATH}`);
  console.log(`Database provider: ${process.env.USE_SUPABASE === "true" ? "Supabase/PostgreSQL" : "db.json"}`);
});