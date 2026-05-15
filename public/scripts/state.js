const phaseEl = document.getElementById("hudPhase");
const livesEl = document.getElementById("hudLives");
const hitsOnEnemyEl = document.getElementById("hudEnemyHits");
const hitsEl = document.getElementById("hudHits");
const missesEl = document.getElementById("hudMisses");
const avgReactionEl = document.getElementById("hudAvgReaction");
const promptEl = document.getElementById("hudPrompt");
const enemyHpFillEl = document.getElementById("enemyHpFill");
const enemyHpTextEl = document.getElementById("enemyHpText");
const playerHpFillEl = document.getElementById("playerHpFill");
const playerHpTextEl = document.getElementById("playerHpText");
const resultEl = document.getElementById("hudResult");
const resultBgEl = document.getElementById("hudResultBg");
const promptBgEl = document.getElementById("hudPromptBg");
const customModeEnabledEl = document.getElementById("customModeEnabled");
const customLivesEl = document.getElementById("customLives");
const customLivesInfiniteEl = document.getElementById("customLivesInfinite");
const customEnemyHitsEl = document.getElementById("customEnemyHits");
const customEnemyHitsInfiniteEl = document.getElementById("customEnemyHitsInfinite");
const customDifficultyEl = document.getElementById("customDifficulty");
const sfxVolumeSelectEl = document.getElementById("sfxVolumeSelect");
const performanceHistoryListEl = document.getElementById("performanceHistoryList");
const historyEmptyTextEl = document.getElementById("historyEmptyText");

const HISTORY_API_URL = "/api/history";
const HISTORY_IMPORT_API_URL = "/api/history/import";
const LEGACY_PERFORMANCE_HISTORY_COOKIE = "hb_performance_history";
const PERFORMANCE_HISTORY_COOKIE_DAYS = 180;
const PERFORMANCE_HISTORY_LIMIT = 12;
const ACTION_TYPES = ["attack", "dodgeLeft", "dodgeRight", "duck"];
const ACTION_LABELS = {
  attack: "ataque",
  dodgeLeft: "desvio para a esquerda",
  dodgeRight: "desvio para a direita",
  duck: "agachar"
};

const SFX_AUDIO_IDS = [
  "punch-swing",
  "punch-hit",
  "sword-swing",
  "sword-hit",
  "magic-swing",
  "magic-hit",
  "headbutt",
  "king-win",
  "king-defeat",
  "adventure-win",
  "adventurer-defeat",
  "witch-win",
  "witch-defeat",
  "roblox-oof",
  "lego-yoda",
  "wilhelm-scream"
];

const game = {
  running: false,
  waitingInput: false,
  menuOpen: false,
  expectedAction: null,
  promptStartTime: 0,
  reactionTimeoutId: null,
  nextRoundTimeoutId: null,

  phase: 1,
  maxPhases: 3,
  lives: 3,
  maxLives: 3,
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
  phaseStartActionCount: 0,
  phaseSummaryCommitted: false,
  phaseHistory: [],
  actionHistory: [],
  sfxVolume: 1
};

function normalizeSfxVolume(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  if (parsed <= 0) return 0;
  if (parsed <= 0.25) return 0.25;
  if (parsed <= 0.5) return 0.5;
  return 1;
}

function setSfxVolume(value) {
  const volume = normalizeSfxVolume(value);
  game.sfxVolume = volume;

  if (sfxVolumeSelectEl && sfxVolumeSelectEl.value !== String(volume)) {
    sfxVolumeSelectEl.value = String(volume);
  }

  for (const audioId of SFX_AUDIO_IDS) {
    const audioEl = document.getElementById(audioId);
    if (audioEl && typeof audioEl.volume === "number") {
      audioEl.volume = volume;
    }
  }

  if (typeof updateSfxVolumeButtons === "function") {
    updateSfxVolumeButtons();
  }
}

function playSfx(audioId) {
  if (!audioId || game.sfxVolume <= 0) return;
  const audioEl = document.getElementById(audioId);
  if (!audioEl || typeof audioEl.play !== "function") return;
  audioEl.volume = game.sfxVolume;
  audioEl.currentTime = 0;
  audioEl.play().catch(() => {});
}

function isInfinite(value) {
  return value === Infinity;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function getSelectedDifficultyPhase() {
  return customDifficultyEl
    ? Math.min(3, Math.max(1, parsePositiveInt(customDifficultyEl.value, 2)))
    : 2;
}

function getActiveDifficultyPhase() {
  return Math.min(3, Math.max(1, parsePositiveInt(game.difficultyPhase || getSelectedDifficultyPhase(), 2)));
}

function getStartSettings() {
  const customModeEnabled = Boolean(customModeEnabledEl && customModeEnabledEl.checked);
  const difficultyPhase = getSelectedDifficultyPhase();

  if (!customModeEnabled) {
    return {
      customMode: false,
      phase: 1,
      maxPhases: 3,
      lives: 3,
      enemyHitsNeeded: getEnemyHitsNeeded(difficultyPhase),
      difficultyPhase
    };
  }

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
    phase: 1,
    maxPhases: 3,
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

function getActionLabel(action) {
  return ACTION_LABELS[action] || String(action || "desconhecida");
}

function isKnownAction(action) {
  return ACTION_TYPES.includes(action);
}

function parseMaybeInfinite(value) {
  if (value === "INF" || value === Infinity) return Infinity;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

  const expectedAction = isKnownAction(rawItem.expectedAction) ? rawItem.expectedAction : "attack";
  const actualAction = rawItem.actualAction == null ? null : String(rawItem.actualAction).slice(0, 40);
  const reactionTimeValue = rawItem.reactionTime == null ? null : Number(rawItem.reactionTime);
  const createdAt = new Date(rawItem.createdAt);
  const outcome = rawItem.outcome === "success" || rawItem.outcome === "miss" || rawItem.outcome === "timeout"
    ? rawItem.outcome
    : (rawItem.correct ? "success" : (actualAction == null ? "timeout" : "miss"));

  return {
    id: String(rawItem.id || `${Date.now()}-${phaseFallback}-${index}`).slice(0, 80),
    phase: parsePositiveInt(rawItem.phase, phaseFallback),
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
    const actionType = isKnownAction(action.expectedAction) ? action.expectedAction : "attack";
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

  const phase = parsePositiveInt(rawItem.phase, 1);
  const difficultyPhase = parsePositiveInt(rawItem.difficultyPhase, phase);
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

async function fetchPerformanceHistoryFromDb() {
  try {
    const response = await fetch(HISTORY_API_URL, { cache: "no-store" });
    if (!response.ok) return [];

    const parsed = await response.json();
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeHistoryItem(item))
      .filter(Boolean)
      .slice(0, PERFORMANCE_HISTORY_LIMIT);
  } catch (error) {
    console.warn("Nao foi possivel carregar historico do db.json.", error);
    return [];
  }
}

function loadLegacyPerformanceHistory() {
  try {
    const rawCookie = getCookie(LEGACY_PERFORMANCE_HISTORY_COOKIE);
    if (!rawCookie) return [];

    const parsed = JSON.parse(rawCookie);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item, index) => {
        if (item && item.livesLeft === "INF") item.livesLeft = Infinity;
        if (item && item.enemyHitsNeeded === "INF") item.enemyHitsNeeded = Infinity;
        return normalizeHistoryItem(item, index);
      })
      .filter(Boolean)
      .slice(0, PERFORMANCE_HISTORY_LIMIT);
  } catch (error) {
    console.warn("Nao foi possivel ler historico antigo em cookie.", error);
    return [];
  }
}

async function importLegacyPerformanceHistory(entries) {
  try {
    const response = await fetch(HISTORY_IMPORT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ entries: entries.map((item) => serializeHistoryItem(item)) })
    });

    if (!response.ok) return [];

    const parsed = await response.json();
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizeHistoryItem(item))
      .filter(Boolean)
      .slice(0, PERFORMANCE_HISTORY_LIMIT);
  } catch (error) {
    console.warn("Nao foi possivel migrar historico antigo para o db.json.", error);
    return [];
  }
}

async function persistPerformanceHistory() {
  const latestItem = game.phaseHistory[0];
  if (!latestItem) return null;

  try {
    const response = await fetch(HISTORY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(serializeHistoryItem(latestItem))
    });

    if (!response.ok) return null;

    const savedItem = await response.json();
    const normalizedItem = normalizeHistoryItem(savedItem);
    if (normalizedItem) {
      game.phaseHistory[0] = normalizedItem;
      renderPerformanceHistory();
      if (typeof updateVRHistory === "function") updateVRHistory();
    }

    return normalizedItem;
  } catch (error) {
    console.warn("Nao foi possivel salvar historico no db.json.", error);
    return null;
  }
}

async function initializePerformanceHistory() {
  const dbHistory = await fetchPerformanceHistoryFromDb();

  if (dbHistory.length > 0) {
    game.phaseHistory = dbHistory;
    renderPerformanceHistory();
    if (typeof updateVRHistory === "function") updateVRHistory();
    return;
  }

  const legacyHistory = loadLegacyPerformanceHistory();
  if (legacyHistory.length > 0) {
    game.phaseHistory = legacyHistory;
    renderPerformanceHistory();
    if (typeof updateVRHistory === "function") updateVRHistory();

    const migratedHistory = await importLegacyPerformanceHistory(legacyHistory);
    if (migratedHistory.length > 0) {
      game.phaseHistory = migratedHistory;
      renderPerformanceHistory();
      if (typeof updateVRHistory === "function") updateVRHistory();
    }
    return;
  }

  game.phaseHistory = [];
  renderPerformanceHistory();
  if (typeof updateVRHistory === "function") updateVRHistory();
}

function recordActionAttempt({ actualAction = null, source = "unknown", reactionTime = null, outcome = null } = {}) {
  const expectedAction = game.expectedAction || "attack";
  const correct = actualAction != null && actualAction === expectedAction;
  const resolvedOutcome = outcome || (correct ? "success" : (actualAction == null ? "timeout" : "miss"));

  const entry = {
    id: `${Date.now()}-${game.phase}-${game.actionHistory.length}`,
    phase: game.phase,
    expectedAction,
    actualAction,
    source: String(source || "unknown").slice(0, 40),
    outcome: resolvedOutcome,
    correct,
    reactionTime: Number.isFinite(reactionTime) && reactionTime >= 0 ? reactionTime : null,
    createdAt: new Date().toISOString()
  };

  game.actionHistory.push(entry);
  return entry;
}

function getDifficultyLabel(level) {
  if (level === 1) return "Fácil — Rei";
  if (level === 2) return "Intermediário — Aventureira";
  return "Difícil — Bruxa";
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
  const phaseActions = game.actionHistory.slice(game.phaseStartActionCount);

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
    actions: phaseActions,
    actionBreakdown: buildActionBreakdown(phaseActions),
    createdAt: new Date().toISOString()
  });

  if (game.phaseHistory.length > PERFORMANCE_HISTORY_LIMIT) {
    game.phaseHistory.length = PERFORMANCE_HISTORY_LIMIT;
  }

  game.phaseSummaryCommitted = true;
  game.actionHistory = [];
  game.phaseStartActionCount = 0;
  void persistPerformanceHistory();
  renderPerformanceHistory();
}

function beginPhaseTracking() {
  game.phaseStartTime = performance.now();
  game.phaseStartHits = game.hits;
  game.phaseStartMisses = game.misses;
  game.phaseStartEnemyHits = game.enemyHits;
  game.phaseStartReactionCount = game.reactionTimes.length;
  game.phaseStartActionCount = game.actionHistory.length;
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

    const details = document.createElement("details");
    details.className = "history-details";

    const summary = document.createElement("summary");
    summary.textContent = "Ver detalhes por ação";

    const breakdownTitle = document.createElement("p");
    breakdownTitle.className = "history-section-title";
    breakdownTitle.textContent = "Resumo por ação";

    const breakdownList = document.createElement("ul");
    breakdownList.className = "history-breakdown-list";

    for (const actionType of ACTION_TYPES) {
      const stats = item.actionBreakdown && item.actionBreakdown[actionType]
        ? item.actionBreakdown[actionType]
        : createEmptyActionStats();

      const breakdownItem = document.createElement("li");
      breakdownItem.className = "history-breakdown-item";
      const avgActionLabel = stats.avgReaction == null ? "--" : formatSeconds(stats.avgReaction);
      breakdownItem.textContent = `${getActionLabel(actionType)}: ${stats.attempts} tentativas | ${stats.hits} acertos | ${stats.misses} erros | ${stats.timeouts} por tempo | media ${avgActionLabel} | precisao ${stats.accuracy.toFixed(1)}%`;
      breakdownList.appendChild(breakdownItem);
    }

    const actionLogTitle = document.createElement("p");
    actionLogTitle.className = "history-section-title";
    actionLogTitle.textContent = "Eventos individuais";

    details.appendChild(summary);
    details.appendChild(breakdownTitle);
    details.appendChild(breakdownList);
    details.appendChild(actionLogTitle);

    if (Array.isArray(item.actions) && item.actions.length > 0) {
      const actionLogList = document.createElement("ul");
      actionLogList.className = "history-action-log";

      for (const action of item.actions) {
        const actionItem = document.createElement("li");
        actionItem.className = "history-action-item";

        const outcomeLabel = action.outcome === "success"
          ? "acerto"
          : (action.outcome === "timeout" ? "tempo esgotado" : "erro");
        const expectedLabel = getActionLabel(action.expectedAction);
        const actualLabel = action.actualAction == null ? "--" : getActionLabel(action.actualAction);
        const reactionLabel = action.reactionTime == null ? "--" : formatSeconds(action.reactionTime);

        actionItem.textContent = `${expectedLabel} -> ${outcomeLabel} | resposta: ${actualLabel} | reacao: ${reactionLabel} | fonte: ${action.source}`;
        actionLogList.appendChild(actionItem);
      }

      details.appendChild(actionLogList);
    } else {
      const actionEmpty = document.createElement("p");
      actionEmpty.className = "history-action-empty";
      actionEmpty.textContent = "Sem detalhamento por ação para sessões antigas.";
      details.appendChild(actionEmpty);
    }

    li.appendChild(title);
    li.appendChild(meta);
    li.appendChild(details);
    performanceHistoryListEl.appendChild(li);
  }
}

void initializePerformanceHistory();

function getEnemyName(phase) {
  if (phase === 1) return "o rei";
  if (phase === 2) return "a aventureira";
  return "a bruxa";
}

function getEnemyDisplayName(phase) {
  if (phase === 1) return "Rei";
  if (phase === 2) return "Aventureira";
  return "Bruxa";
}

function getEnemyModelAsset(phase) {
  return getEnemyProfile(phase).asset;
}

const ENEMY_PROFILES = {
  1: {
    key: "king",
    displayName: "Rei",
    asset: "#kingModel",
    scale: "1.12 1.12 1.12",
    idleClip: "CharacterArmature|Idle_Neutral",
    runClip: "CharacterArmature|Walk",
    deathClip: "CharacterArmature|Death",
    vulnerableClip: "CharacterArmature|HitRecieve_2",
    attackStyle: "brawler",
    attacks: {
      left: "CharacterArmature|Punch_Right",
      right: "CharacterArmature|Punch_Left",
      high: "CharacterArmature|Punch_Left"
    },
    windupClips: {
      left: "CharacterArmature|Punch_Right",
      right: "CharacterArmature|Punch_Left",
      high: "CharacterArmature|Punch_Left"
    },
    windupOptions: { timeScale: 0.18, holdAtWindup: true },
    windupMs: 1150,
    speed: 0.046,
    attackDistance: 2.35,
    hitsNeeded: 3,
    reactionWindow: 1500,
    attackCooldown: 1500,
    attackDelay: { left: 0, right: 0, high: 0, vulnerable: 0 },
    patternWeights: { vulnerable: 0.60, left: 0.20, right: 0.20, high: 0 }
  },
  2: {
    key: "adventurer",
    displayName: "Aventureira",
    asset: "#hoodedAdventurerModel",
    scale: "1.15 1.15 1.15",
    idleClip: "CharacterArmature|Idle_Sword",
    runClip: "CharacterArmature|Run",
    deathClip: "CharacterArmature|Death",
    vulnerableClip: "CharacterArmature|HitRecieve",
    attackStyle: "weapon",
    attacks: {
      right: "CharacterArmature|Punch_Left",
      left: "CharacterArmature|Sword_Slash",
      leftOptions: { reverse: false, swordFx: true },
      high: "CharacterArmature|Kick_Right"
    },
    speed: 0.046,
    attackDistance: 1.9,
    hitsNeeded: 4,
    reactionWindow: 760,
    attackCooldown: 760,
    attackDelay: { left: 0, right: 0, high: 0, vulnerable: 0 },
    patternWeights: { vulnerable: 0.24, left: 0.28, right: 0.28, high: 0.20 }
  },
  3: {
    key: "witch",
    displayName: "Bruxa",
    asset: "#witchModel",
    scale: "1.13 1.13 1.13",
    idleClip: "CharacterArmature|Idle_Gun_Pointing",
    runClip: "CharacterArmature|Run",
    deathClip: "CharacterArmature|Death",
    vulnerableClip: "CharacterArmature|HitRecieve",
    attackStyle: "magic",
    attacks: {
      left: "CharacterArmature|Idle_Gun_Shoot",
      right: "CharacterArmature|Gun_Shoot",
      high: "CharacterArmature|Gun_Shoot"
    },
    speed: 0.039,
    attackDistance: 3.45,
    keepDistance: 2.85,
    hitsNeeded: 5,
    reactionWindow: 720,
    attackCooldown: 720,
    attackDelay: { left: 0, right: 0, high: 0, vulnerable: 0 },
    patternWeights: { vulnerable: 0.14, left: 0.31, right: 0.31, high: 0.24 }
  }
};

function getEnemyProfile(phase) {
  const resolvedPhase = Math.min(3, Math.max(1, Number.parseInt(phase, 10) || 1));
  return ENEMY_PROFILES[resolvedPhase] || ENEMY_PROFILES[1];
}

function getEnemyModelScale(phase) {
  return getEnemyProfile(phase).scale;
}

function getEnemyIdleClip(phase) {
  return getEnemyProfile(phase).idleClip;
}

function getEnemyRunClip(phase) {
  return getEnemyProfile(phase).runClip;
}

function getEnemyHitsNeeded(phase) {
  return getEnemyProfile(phase).hitsNeeded;
}

function getReactionWindow(phase) {
  return getEnemyProfile(phase).reactionWindow;
}

function getEnemySpeed(phase) {
  return getEnemyProfile(phase).speed;
}

function getEnemyAttackDistance(phase) {
  return getEnemyProfile(phase).attackDistance;
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