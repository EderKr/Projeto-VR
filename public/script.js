const phaseEl = document.getElementById("phase");
const livesEl = document.getElementById("lives");
const roundEl = document.getElementById("round");
const enemyActionEl = document.getElementById("enemy-action");
const playerActionEl = document.getElementById("player-action");
const resultEl = document.getElementById("result");
const reactionTimeEl = document.getElementById("reaction-time");

const hitsEl = document.getElementById("hits");
const missesEl = document.getElementById("misses");
const accuracyEl = document.getElementById("accuracy");
const avgReactionEl = document.getElementById("avg-reaction");
const historyEl = document.getElementById("history");

const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");
const stopBtn = document.getElementById("stop-btn");

const customModeToggle = document.getElementById("custom-mode-toggle");
const customFields = document.getElementById("custom-fields");
const customLivesInput = document.getElementById("custom-lives");
const infiniteLivesToggle = document.getElementById("infinite-lives");
const customHeadbuttsInput = document.getElementById("custom-headbutts");
const infiniteHeadbuttsToggle = document.getElementById("infinite-headbutts");
const customDifficultySelect = document.getElementById("custom-difficulty");

const attacks = ["left", "right", "high", "vulnerable"];

const gameState = {
  running: false,
  waitingInput: false,
  currentAttack: null,
  attackStartTime: 0,
  reactionTimeoutId: null,

  phase: 1,
  round: 0,
  maxPhases: 3,

  lives: 3,
  hits: 0,
  misses: 0,
  reactionTimes: [],

  enemyHeadbuttsTaken: 0,
  headbuttsNeeded: 3,

  phaseHits: 0,
  phaseMisses: 0,
  phaseReactionTimes: [],
  history: [],

  useCustomSettings: false,
  settings: {
    mode: "normal",
    lives: 3,
    infiniteLives: false,
    headbuttsNeeded: 3,
    infiniteHeadbutts: false,
    difficulty: 1,
  },
};

function updateCustomFieldsState() {
  customFields.style.display = customModeToggle.checked ? "block" : "none";
}

function loadCustomSettings() {
  const customEnabled = customModeToggle.checked;

  gameState.useCustomSettings = customEnabled;

  if (!customEnabled) {
    gameState.settings = {
      mode: "normal",
      lives: 3,
      infiniteLives: false,
      headbuttsNeeded: 3,
      infiniteHeadbutts: false,
      difficulty: 1,
    };
    return;
  }

  gameState.settings = {
    mode: "custom",
    lives: Math.max(1, Number(customLivesInput.value) || 3),
    infiniteLives: infiniteLivesToggle.checked,
    headbuttsNeeded: Math.max(1, Number(customHeadbuttsInput.value) || 3),
    infiniteHeadbutts: infiniteHeadbuttsToggle.checked,
    difficulty: Number(customDifficultySelect.value) || 1,
  };
}

function getHeadbuttsNeededForPhase(phase) {
  if (gameState.useCustomSettings) {
    if (gameState.settings.infiniteHeadbutts) return Infinity;
    return gameState.settings.headbuttsNeeded;
  }

  if (phase === 1) return 3;
  if (phase === 2) return 4;
  return 5;
}

function updateHUD() {
  phaseEl.textContent = gameState.phase;
  livesEl.textContent = gameState.lives === Infinity ? "∞" : gameState.lives;

  const neededHeadbutts =
    gameState.headbuttsNeeded === Infinity ? "∞" : gameState.headbuttsNeeded;
  roundEl.textContent = `${gameState.enemyHeadbuttsTaken}/${neededHeadbutts}`;

  hitsEl.textContent = gameState.hits;
  missesEl.textContent = gameState.misses;

  const total = gameState.hits + gameState.misses;
  const accuracy = total > 0 ? ((gameState.hits / total) * 100).toFixed(1) : "0.0";
  accuracyEl.textContent = `${accuracy}%`;

  if (gameState.reactionTimes.length > 0) {
    const avg =
      gameState.reactionTimes.reduce((sum, time) => sum + time, 0) /
      gameState.reactionTimes.length;
    avgReactionEl.textContent = `${avg.toFixed(3)}s`;
  } else {
    avgReactionEl.textContent = "--";
  }
}

function renderHistory() {
  if (gameState.history.length === 0) {
    historyEl.innerHTML = "<p>Nenhum registro salvo ainda.</p>";
    return;
  }

  historyEl.innerHTML = "";

  gameState.history.forEach((item) => {
    const card = document.createElement("div");
    card.className = "history-card";

    const headbuttsText =
      item.headbuttsNeeded === Infinity
        ? `${item.headbutts}/∞`
        : `${item.headbutts}/${item.headbuttsNeeded}`;

    const livesText = item.lives === Infinity ? "∞" : item.lives;
    const modeText = item.mode === "custom" ? "Customizado" : "Normal";

    let levelText = "";
    if (item.mode === "custom") {
      levelText = `<p>Dificuldade: ${item.difficulty}</p>`;
    } else {
      levelText = `<p>Fase: ${item.phase}</p>`;
    }

    card.innerHTML = `
      <p><strong>${modeText}</strong></p>
      ${levelText}
      <p>Vidas restantes: ${livesText}</p>
      <p>Ataques aplicados: ${headbuttsText}</p>
      <p>Acertos: ${item.hits} | Erros: ${item.misses}</p>
      <p>Precisão: ${item.accuracy}%</p>
      <p>Tempo médio: ${item.avgReaction}</p>
    `;
    historyEl.appendChild(card);
  });
}

function setResult(message, type = "neutral") {
  resultEl.textContent = message;
  resultEl.className = `result ${type}`;
}

function getActionLabel(key) {
  switch (key) {
    case "ArrowUp":
      return "Cabeçada";
    case "ArrowLeft":
      return "Esquiva para a esquerda";
    case "ArrowRight":
      return "Esquiva para a direita";
    case "ArrowDown":
      return "Agachar";
    default:
      return "Nenhuma";
  }
}

function getCorrectKey(attack) {
  switch (attack) {
    case "left":
      return "ArrowLeft";
    case "right":
      return "ArrowRight";
    case "high":
      return "ArrowDown";
    case "vulnerable":
      return "ArrowUp";
    default:
      return null;
  }
}

function getAttackMessage(attack) {
  switch (attack) {
    case "left":
      return "← DESVIAR";
    case "right":
      return "→ DESVIAR";
    case "high":
      return "↓ AGACHAR";
    case "vulnerable":
      return "↑ ATACAR";
    default:
      return "...";
  }
}

function getPhaseDelay() {
  const level = gameState.useCustomSettings
    ? gameState.settings.difficulty
    : gameState.phase;

  if (level === 1) return 2200;
  if (level === 2) return 1700;
  return 1400;
}

function calculatePhaseStats() {
  const total = gameState.phaseHits + gameState.phaseMisses;
  const accuracy =
    total > 0 ? ((gameState.phaseHits / total) * 100).toFixed(1) : "0.0";

  let avgReaction = "--";
  if (gameState.phaseReactionTimes.length > 0) {
    const avg =
      gameState.phaseReactionTimes.reduce((sum, time) => sum + time, 0) /
      gameState.phaseReactionTimes.length;
    avgReaction = `${avg.toFixed(3)}s`;
  }

  return {
    mode: gameState.useCustomSettings ? "custom" : "normal",
    phase: gameState.phase,
    difficulty: gameState.useCustomSettings ? gameState.settings.difficulty : null,
    lives: gameState.lives,
    headbutts: gameState.enemyHeadbuttsTaken,
    headbuttsNeeded: gameState.headbuttsNeeded,
    hits: gameState.phaseHits,
    misses: gameState.phaseMisses,
    accuracy,
    avgReaction,
  };
}

function saveCurrentPerformanceToHistory() {
  const total = gameState.phaseHits + gameState.phaseMisses;

  if (total === 0 && gameState.enemyHeadbuttsTaken === 0) {
    return;
  }

  const stats = calculatePhaseStats();
  gameState.history.push(stats);
  renderHistory();
}

function resetPhaseStats() {
  gameState.phaseHits = 0;
  gameState.phaseMisses = 0;
  gameState.phaseReactionTimes = [];
  gameState.enemyHeadbuttsTaken = 0;
  gameState.headbuttsNeeded = getHeadbuttsNeededForPhase(gameState.phase);
}

function clearReactionTimeout() {
  if (gameState.reactionTimeoutId !== null) {
    clearTimeout(gameState.reactionTimeoutId);
    gameState.reactionTimeoutId = null;
  }
}

function removeLife() {
  if (gameState.lives !== Infinity) {
    gameState.lives -= 1;
  }
}

function endGame(message) {
  clearReactionTimeout();

  gameState.running = false;
  gameState.waitingInput = false;
  enemyActionEl.textContent = message;
  setResult("Jogo encerrado.", "neutral");
  startBtn.disabled = true;
  restartBtn.disabled = false;
  stopBtn.disabled = true;
}

function completePhase() {
  clearReactionTimeout();

  const stats = calculatePhaseStats();
  gameState.history.push(stats);
  renderHistory();

  if (gameState.useCustomSettings) {
    if (gameState.headbuttsNeeded !== Infinity) {
      endGame("Objetivo do modo customizado concluído!");
    } else {
      endGame("Modo customizado encerrado.");
    }
    return;
  }

  if (gameState.phase >= gameState.maxPhases) {
    endGame("Você derrotou todos os inimigos das fases!");
    return;
  }

  gameState.phase += 1;
  gameState.round = 0;
  resetPhaseStats();

  enemyActionEl.textContent = `Fase ${gameState.phase} iniciando...`;
  playerActionEl.textContent = "Sua ação: nenhuma";
  reactionTimeEl.textContent = "Tempo de reação: --";
  setResult("Novo inimigo encontrado. Prepare-se.", "neutral");
  updateHUD();

  setTimeout(() => {
    startRound();
  }, 1500);
}

function stopCustomGame() {
  if (!gameState.running || !gameState.useCustomSettings) return;

  saveCurrentPerformanceToHistory();
  clearReactionTimeout();

  gameState.running = false;
  gameState.waitingInput = false;

  enemyActionEl.textContent = "Modo customizado interrompido.";
  playerActionEl.textContent = "Sua ação: nenhuma";
  reactionTimeEl.textContent = "Tempo de reação: --";
  setResult("Desempenho salvo no histórico.", "neutral");

  startBtn.disabled = false;
  restartBtn.disabled = false;
  stopBtn.disabled = true;

  updateHUD();
}

function evaluateMissByTimeout() {
  if (!gameState.running || !gameState.waitingInput) return;

  clearReactionTimeout();
  gameState.waitingInput = false;

  playerActionEl.textContent = "Sua ação: nenhuma";
  reactionTimeEl.textContent = "Tempo de reação: esgotado";

  if (gameState.currentAttack === "vulnerable") {
    gameState.misses += 1;
    gameState.phaseMisses += 1;
    setResult("Você perdeu a chance de atacar, mas não perdeu vida.", "error");
    updateHUD();

    setTimeout(() => {
      proceedGame();
    }, 1000);
    return;
  }

  gameState.misses += 1;
  gameState.phaseMisses += 1;
  removeLife();

  setResult("Tempo esgotado! Você errou.", "error");
  updateHUD();

  if (gameState.lives <= 0) {
    endGame("Você perdeu todas as vidas.");
    return;
  }

  setTimeout(() => {
    proceedGame();
  }, 1000);
}

function startRound() {
  if (!gameState.running) return;

  clearReactionTimeout();

  gameState.round += 1;
  const randomAttack = attacks[Math.floor(Math.random() * attacks.length)];
  gameState.currentAttack = randomAttack;
  gameState.attackStartTime = performance.now();
  gameState.waitingInput = true;

  enemyActionEl.textContent = getAttackMessage(randomAttack);
  playerActionEl.textContent = "Sua ação: nenhuma";
  reactionTimeEl.textContent = "Tempo de reação: --";
  setResult("Reaja agora!", "neutral");
  updateHUD();

  gameState.reactionTimeoutId = setTimeout(() => {
    evaluateMissByTimeout();
  }, getPhaseDelay());
}

function proceedGame() {
  if (!gameState.running) return;

  if (
    gameState.headbuttsNeeded !== Infinity &&
    gameState.enemyHeadbuttsTaken >= gameState.headbuttsNeeded
  ) {
    completePhase();
    return;
  }

  startRound();
}

function handlePlayerInput(key) {
  if (!gameState.running || !gameState.waitingInput) return;

  const validKeys = ["ArrowUp", "ArrowLeft", "ArrowRight", "ArrowDown"];
  if (!validKeys.includes(key)) return;

  clearReactionTimeout();
  gameState.waitingInput = false;

  playerActionEl.textContent = `Sua ação: ${getActionLabel(key)}`;

  const correctKey = getCorrectKey(gameState.currentAttack);
  const reactionTime = (performance.now() - gameState.attackStartTime) / 1000;

  reactionTimeEl.textContent = `Tempo de reação: ${reactionTime.toFixed(3)}s`;

  if (key === correctKey) {
    gameState.hits += 1;
    gameState.phaseHits += 1;
    gameState.reactionTimes.push(reactionTime);
    gameState.phaseReactionTimes.push(reactionTime);

    if (gameState.currentAttack === "vulnerable") {
      gameState.enemyHeadbuttsTaken += 1;
      setResult(
        `Cabeçada acertada! Progresso: ${gameState.enemyHeadbuttsTaken}/${gameState.headbuttsNeeded === Infinity ? "∞" : gameState.headbuttsNeeded}`,
        "success"
      );
    } else {
      setResult("Defesa correta!", "success");
    }
  } else {
    gameState.misses += 1;
    gameState.phaseMisses += 1;

    if (gameState.currentAttack === "vulnerable") {
      setResult("Ataque errado. Você errou a oportunidade, mas não perdeu vida.", "error");
    } else {
      removeLife();
      setResult("Errou a resposta!", "error");
    }
  }

  updateHUD();

  if (gameState.lives <= 0) {
    endGame("Você perdeu todas as vidas.");
    return;
  }

  setTimeout(() => {
    proceedGame();
  }, 1000);
}

function startGame() {
  clearReactionTimeout();
  loadCustomSettings();

  gameState.running = true;
  gameState.waitingInput = false;
  gameState.currentAttack = null;
  gameState.attackStartTime = 0;

  gameState.phase = 1;
  gameState.round = 0;
  gameState.lives = gameState.settings.infiniteLives
    ? Infinity
    : gameState.settings.lives;

  gameState.hits = 0;
  gameState.misses = 0;
  gameState.reactionTimes = [];
  gameState.history = gameState.history;

  resetPhaseStats();
  updateHUD();

  startBtn.disabled = true;
  restartBtn.disabled = false;
  stopBtn.disabled = !gameState.useCustomSettings;

  enemyActionEl.textContent = "Prepare-se...";
  playerActionEl.textContent = "Sua ação: nenhuma";
  reactionTimeEl.textContent = "Tempo de reação: --";
  setResult("Jogo iniciado.", "neutral");

  setTimeout(() => {
    startRound();
  }, 1000);
}

function resetGame() {
  clearReactionTimeout();

  startBtn.disabled = false;
  restartBtn.disabled = true;
  stopBtn.disabled = true;

  gameState.running = false;
  gameState.waitingInput = false;
  gameState.currentAttack = null;
  gameState.attackStartTime = 0;

  gameState.phase = 1;
  gameState.round = 0;
  gameState.lives = 3;
  gameState.hits = 0;
  gameState.misses = 0;
  gameState.reactionTimes = [];

  resetPhaseStats();
  updateHUD();

  enemyActionEl.textContent = "Clique em iniciar para começar";
  playerActionEl.textContent = "Sua ação: nenhuma";
  reactionTimeEl.textContent = "Tempo de reação: --";
  setResult("Aguardando...", "neutral");
}

document.addEventListener(
  "keydown",
  (event) => {
    const blockedKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];

    if (blockedKeys.includes(event.key)) {
      event.preventDefault();
    }
    handlePlayerInput(event.key);
  },
  { passive: false }
);

customModeToggle.addEventListener("change", updateCustomFieldsState);
startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", resetGame);
stopBtn.addEventListener("click", stopCustomGame);

updateCustomFieldsState();
updateHUD();
renderHistory();