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
    createdAt: new Date()
  });

  if (game.phaseHistory.length > 12) {
    game.phaseHistory.length = 12;
  }

  game.phaseSummaryCommitted = true;
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
