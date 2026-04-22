const phaseEl = document.getElementById("hudPhase");
const livesEl = document.getElementById("hudLives");
const hitsOnEnemyEl = document.getElementById("hudEnemyHits");
const hitsEl = document.getElementById("hudHits");
const missesEl = document.getElementById("hudMisses");
const avgReactionEl = document.getElementById("hudAvgReaction");
const promptEl = document.getElementById("hudPrompt");
const resultEl = document.getElementById("hudResult");
const resultBgEl = document.getElementById("hudResultBg");
const promptBgEl = document.getElementById("hudPromptBg");
const customModeEnabledEl = document.getElementById("customModeEnabled");
const customLivesEl = document.getElementById("customLives");
const customLivesInfiniteEl = document.getElementById("customLivesInfinite");
const customEnemyHitsEl = document.getElementById("customEnemyHits");
const customEnemyHitsInfiniteEl = document.getElementById("customEnemyHitsInfinite");
const customDifficultyEl = document.getElementById("customDifficulty");
const performanceHistoryListEl = document.getElementById("performanceHistoryList");
const historyEmptyTextEl = document.getElementById("historyEmptyText");

const PERFORMANCE_HISTORY_COOKIE = "hb_performance_history";
const PERFORMANCE_HISTORY_COOKIE_DAYS = 180;
const PERFORMANCE_HISTORY_LIMIT = 12;

const game = {
  running: false,
  waitingInput: false,
  expectedAction: null,
  promptStartTime: 0,
  reactionTimeoutId: null,
  nextRoundTimeoutId: null,

  phase: 1,
  maxPhases: 3,
  lives: 3,
  hits: 0,
  misses: 0,
  reactionTimes: [],
  enemyHits: 0,
  enemyHitsNeeded: 3,

  customMode: false,
  difficultyPhase: 1,

  phaseStartTime: 0,
  phaseStartHits: 0,
  phaseStartMisses: 0,
  phaseStartEnemyHits: 0,
  phaseStartReactionCount: 0,
  phaseSummaryCommitted: false,
  phaseHistory: []
};

function isInfinite(value) {
  return value === Infinity;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function getStartSettings() {
  const customModeEnabled = Boolean(customModeEnabledEl && customModeEnabledEl.checked);

  if (!customModeEnabled) {
    return {
      customMode: false,
      phase: 1,
      maxPhases: 3,
      lives: 3,
      enemyHitsNeeded: getEnemyHitsNeeded(1),
      difficultyPhase: 1
    };
  }

  const difficultyPhase = customDifficultyEl
    ? Math.min(3, Math.max(1, parsePositiveInt(customDifficultyEl.value, 1)))
    : 1;

  const livesInfinite = Boolean(customLivesInfiniteEl && customLivesInfiniteEl.checked);
  const enemyHitsInfinite = Boolean(customEnemyHitsInfiniteEl && customEnemyHitsInfiniteEl.checked);

  const lives = livesInfinite
    ? Infinity
    : parsePositiveInt(customLivesEl ? customLivesEl.value : 3, 3);

  const enemyHitsNeeded = enemyHitsInfinite
    ? Infinity
    : parsePositiveInt(customEnemyHitsEl ? customEnemyHitsEl.value : 3, getEnemyHitsNeeded(difficultyPhase));

  return {
    customMode: true,
    phase: difficultyPhase,
    maxPhases: difficultyPhase,
    lives,
    enemyHitsNeeded,
    difficultyPhase
  };
}

function setCanvasText(el, value) {
  el.setAttribute("canvas-text", "value", value);
}

function formatSeconds(seconds) {
  return `${Number(seconds).toFixed(2)}s`;
}

function setCookie(name, value, days) {
  const maxAgeSeconds = Math.max(0, Math.floor(days * 24 * 60 * 60));
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

function getCookie(name) {
  const encodedName = `${encodeURIComponent(name)}=`;
  const parts = document.cookie ? document.cookie.split(";") : [];

  for (const part of parts) {
    const cookie = part.trim();
    if (cookie.startsWith(encodedName)) {
      return decodeURIComponent(cookie.slice(encodedName.length));
    }
  }

  return null;
}

function normalizeHistoryItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") return null;

  const phase = parsePositiveInt(rawItem.phase, 1);
  const difficultyPhase = parsePositiveInt(rawItem.difficultyPhase, phase);
  const status = rawItem.status === "concluida" || rawItem.status === "derrota" || rawItem.status === "interrompida"
    ? rawItem.status
    : "interrompida";
  const livesLeft = rawItem.livesLeft === Infinity ? Infinity : Number(rawItem.livesLeft);
  const enemyHitsNeeded = rawItem.enemyHitsNeeded === Infinity ? Infinity : Number(rawItem.enemyHitsNeeded);
  const parsedCreatedAt = new Date(rawItem.createdAt);

  return {
    id: String(rawItem.id || `${Date.now()}-${phase}`).slice(0, 80),
    phase,
    customMode: Boolean(rawItem.customMode),
    difficultyPhase,
    status,
    livesLeft: Number.isFinite(livesLeft) ? Math.max(0, livesLeft) : Infinity,
    enemyHits: Math.max(0, Number(rawItem.enemyHits) || 0),
    enemyHitsNeeded: Number.isFinite(enemyHitsNeeded) ? Math.max(1, enemyHitsNeeded) : Infinity,
    hits: Math.max(0, Number(rawItem.hits) || 0),
    misses: Math.max(0, Number(rawItem.misses) || 0),
    attempts: Math.max(0, Number(rawItem.attempts) || 0),
    accuracy: Math.max(0, Math.min(100, Number(rawItem.accuracy) || 0)),
    duration: Math.max(0, Number(rawItem.duration) || 0),
    avgReaction: rawItem.avgReaction == null ? null : Math.max(0, Number(rawItem.avgReaction) || 0),
    createdAt: Number.isFinite(parsedCreatedAt.getTime()) ? parsedCreatedAt.toISOString() : new Date().toISOString()
  };
}

function savePerformanceHistory() {
  try {
    const compact = game.phaseHistory
      .slice(0, PERFORMANCE_HISTORY_LIMIT)
      .map((item) => ({
        id: item.id,
        phase: item.phase,
        customMode: item.customMode,
        difficultyPhase: item.difficultyPhase,
        status: item.status,
        livesLeft: isInfinite(item.livesLeft) ? "INF" : item.livesLeft,
        enemyHits: item.enemyHits,
        enemyHitsNeeded: isInfinite(item.enemyHitsNeeded) ? "INF" : item.enemyHitsNeeded,
        hits: item.hits,
        misses: item.misses,
        attempts: item.attempts,
        accuracy: Number(item.accuracy.toFixed(2)),
        duration: Number(item.duration.toFixed(2)),
        avgReaction: item.avgReaction == null ? null : Number(item.avgReaction.toFixed(3)),
        createdAt: item.createdAt
      }));

    setCookie(
      PERFORMANCE_HISTORY_COOKIE,
      JSON.stringify(compact),
      PERFORMANCE_HISTORY_COOKIE_DAYS
    );
  } catch (error) {
    console.warn("Nao foi possivel salvar historico em cookie.", error);
  }
}

function loadPerformanceHistory() {
  try {
    const rawCookie = getCookie(PERFORMANCE_HISTORY_COOKIE);
    if (!rawCookie) return [];

    const parsed = JSON.parse(rawCookie);
    if (!Array.isArray(parsed)) return [];

    const normalized = parsed
      .map((item) => {
        if (item && item.livesLeft === "INF") item.livesLeft = Infinity;
        if (item && item.enemyHitsNeeded === "INF") item.enemyHitsNeeded = Infinity;
        return normalizeHistoryItem(item);
      })
      .filter(Boolean)
      .slice(0, PERFORMANCE_HISTORY_LIMIT);

    return normalized;
  } catch (error) {
    console.warn("Historico em cookie invalido, iniciando vazio.", error);
    return [];
  }
}

function getDifficultyLabel(level) {
  if (level === 1) return "facil";
  if (level === 2) return "medio";
  return "dificil";
}

function summarizePhase(status) {
  if (game.phaseSummaryCommitted) return;

  const phaseElapsedSeconds = Math.max(0, (performance.now() - game.phaseStartTime) / 1000);
  const phaseHits = Math.max(0, game.hits - game.phaseStartHits);
  const phaseMisses = Math.max(0, game.misses - game.phaseStartMisses);
  const phaseEnemyHits = Math.max(0, game.enemyHits - game.phaseStartEnemyHits);
  const phaseReactionCount = Math.max(0, game.reactionTimes.length - game.phaseStartReactionCount);
  const attempts = phaseHits + phaseMisses;
  const phaseAccuracy = attempts > 0 ? (phaseHits / attempts) * 100 : 0;

  let phaseAvgReaction = null;
  if (phaseReactionCount > 0) {
    const reactionSlice = game.reactionTimes.slice(game.phaseStartReactionCount);
    const phaseReactionSum = reactionSlice.reduce((acc, value) => acc + value, 0);
    phaseAvgReaction = phaseReactionSum / phaseReactionCount;
  }

  game.phaseHistory.unshift({
    id: `${Date.now()}-${game.phase}-${Math.random().toString(36).slice(2, 8)}`,
    phase: game.phase,
    customMode: game.customMode,
    difficultyPhase: game.difficultyPhase,
    status,
    livesLeft: game.lives,
    enemyHits: phaseEnemyHits,
    enemyHitsNeeded: game.enemyHitsNeeded,
    hits: phaseHits,
    misses: phaseMisses,
    attempts,
    accuracy: phaseAccuracy,
    duration: phaseElapsedSeconds,
    avgReaction: phaseAvgReaction,
    createdAt: new Date().toISOString()
  });

  if (game.phaseHistory.length > PERFORMANCE_HISTORY_LIMIT) {
    game.phaseHistory.length = PERFORMANCE_HISTORY_LIMIT;
  }

  game.phaseSummaryCommitted = true;
  savePerformanceHistory();
  renderPerformanceHistory();
}

function beginPhaseTracking() {
  game.phaseStartTime = performance.now();
  game.phaseStartHits = game.hits;
  game.phaseStartMisses = game.misses;
  game.phaseStartEnemyHits = game.enemyHits;
  game.phaseStartReactionCount = game.reactionTimes.length;
  game.phaseSummaryCommitted = false;
}

function renderPerformanceHistory() {
  if (!performanceHistoryListEl || !historyEmptyTextEl) return;

  performanceHistoryListEl.innerHTML = "";

  if (game.phaseHistory.length === 0) {
    historyEmptyTextEl.style.display = "block";
    return;
  }

  historyEmptyTextEl.style.display = "none";

  for (const item of game.phaseHistory) {
    const li = document.createElement("li");
    li.className = "history-item";

    const title = document.createElement("p");
    title.className = "history-item-title";
    const statusLabel = item.status === "concluida"
      ? "concluida"
      : (item.status === "derrota" ? "encerrada por derrota" : "interrompida");
    const modeLabel = item.customMode
      ? `Modo personalizado (${getDifficultyLabel(item.difficultyPhase)})`
      : `Fase ${item.phase}`;
    title.textContent = `${modeLabel} - ${statusLabel}`;

    const meta = document.createElement("p");
    meta.className = "history-item-meta";
    const avgReactionLabel = item.avgReaction == null ? "--" : formatSeconds(item.avgReaction);
    const enemyGoalLabel = isInfinite(item.enemyHitsNeeded) ? "∞" : item.enemyHitsNeeded;
    const livesLabel = isInfinite(item.livesLeft) ? "∞" : item.livesLeft;

    meta.textContent =
      `Duracao: ${formatSeconds(item.duration)} | Reacao media: ${avgReactionLabel} | ` +
      `Acertos: ${item.hits} | Erros: ${item.misses} | Precisao: ${item.accuracy.toFixed(1)}% | ` +
      `Ataques na fase: ${item.enemyHits}/${enemyGoalLabel} | Vidas restantes: ${livesLabel}`;

    li.appendChild(title);
    li.appendChild(meta);
    performanceHistoryListEl.appendChild(li);
  }
}

game.phaseHistory = loadPerformanceHistory();

function getEnemyHitsNeeded(phase) {
  if (phase === 1) return 3;
  if (phase === 2) return 4;
  return 5;
}

function getReactionWindow(phase) {
  if (phase === 1) return 2200;
  if (phase === 2) return 1700;
  return 1400;
}

function getEnemySpeed(phase) {
  if (phase === 1) return 0.018;
  if (phase === 2) return 0.024;
  return 0.03;
}

function clearTimers() {
  if (game.reactionTimeoutId) {
    clearTimeout(game.reactionTimeoutId);
    game.reactionTimeoutId = null;
  }
  if (game.nextRoundTimeoutId) {
    clearTimeout(game.nextRoundTimeoutId);
    game.nextRoundTimeoutId = null;
  }
}