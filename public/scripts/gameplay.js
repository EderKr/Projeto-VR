function openPrompt(action) {
  clearTimers();
  game.expectedAction = action;
  game.waitingInput = true;
  game.promptStartTime = performance.now();

  setPrompt(getPromptLabel(action));
  setPromptState(true);
  setResult("Reaja agora.");

  game.reactionTimeoutId = setTimeout(() => {
    handleTimeout();
  }, getReactionWindow(game.phase));
}

function handleTimeout() {
  if (!game.running || !game.waitingInput) return;

  clearTimers();
  game.waitingInput = false;
  setPromptState(false);
  recordActionAttempt({
    actualAction: null,
    source: "tempo esgotado",
    outcome: "timeout",
    reactionTime: null
  });

  if (game.expectedAction === "attack") {
    game.misses++;
    setResult("Você perdeu a chance de atacar.", "error");
  } else {
    game.misses++;
    if (!isInfinite(game.lives)) {
      game.lives--;
    }
    flashEnemy("#ff0000");
    setResult("Tempo esgotado. Você foi atingido.", "error");
  }

  updateHUD();
  checkGameStateOrContinue();
}

function receiveAction(action, source = "unknown") {
  if (!game.running || !game.waitingInput) return;

  clearTimers();
  game.waitingInput = false;
  setPromptState(false);

  const reactionTime = (performance.now() - game.promptStartTime) / 1000;
  const correct = action === game.expectedAction;

  recordActionAttempt({
    actualAction: action,
    source,
    outcome: correct ? "success" : "miss",
    reactionTime
  });

  if (correct) {
    game.hits++;
    game.reactionTimes.push(reactionTime);

    if (action === "attack") {
      game.enemyHits++;
      flashEnemy("#00ff66");
      setResult(`Cabeçada acertada via ${source}!`, "success");
    } else {
      setResult(`Defesa correta via ${source}!`, "success");
    }
  } else {
    game.misses++;

    if (game.expectedAction === "attack") {
      setResult(`Ação errada via ${source}. Você perdeu a abertura.`, "error");
    } else {
      if (!isInfinite(game.lives)) {
        game.lives--;
      }
      flashEnemy("#ff0000");
      setResult(`Resposta errada via ${source}. Você foi atingido.`, "error");
    }
  }

  updateHUD();
  checkGameStateOrContinue();
}

function nextPhase() {
  if (game.phase >= game.maxPhases) {
    summarizePhase("concluida");
    game.running = false;
    setRoundControlsVisibility(false);
    setPrompt("VITÓRIA");
    setPromptState(false);
    setResult("Você derrotou todos os inimigos!", "success");
    clearTimers();
    return;
  }

  summarizePhase("concluida");

  game.phase++;
  game.enemyHits = 0;
  game.enemyHitsNeeded = getEnemyHitsNeeded(game.phase);

  const enemy = document.getElementById("enemy");
  enemy.components["enemy-ai"].data.speed = getEnemySpeed(game.phase);
  resetEnemyPosition();

  setPrompt(`FASE ${game.phase}`);
  setPromptState(false);
  setResult("Novo inimigo entrou na arena.");
  updateHUD();
  beginPhaseTracking();

  game.nextRoundTimeoutId = setTimeout(() => {
    if (game.running) {
      document.getElementById("enemy").components["enemy-ai"].resumeCombat();
    }
  }, 1500);
}

function checkGameStateOrContinue() {
  if (!isInfinite(game.lives) && game.lives <= 0) {
    summarizePhase("derrota");
    game.running = false;
    setRoundControlsVisibility(false);
    setPrompt("DERROTA");
    setPromptState(false);
    setResult("Você perdeu todas as vidas.", "error");
    clearTimers();
    return;
  }

  if (!isInfinite(game.enemyHitsNeeded) && game.enemyHits >= game.enemyHitsNeeded) {
    nextPhase();
    return;
  }

  game.nextRoundTimeoutId = setTimeout(() => {
    if (game.running) {
      document.getElementById("enemy").components["enemy-ai"].resumeCombat();
    }
  }, 900);
}

function startGame() {
  clearTimers();

  if (typeof closeVRPauseMenu === 'function') {
    closeVRPauseMenu();
  }

  if (typeof customModeEnabledEl !== 'undefined' && customModeEnabledEl) {
    if (typeof vrMenuState !== 'undefined') {
      vrMenuState.customModeEnabled = customModeEnabledEl.checked;
    }
  }

  const settings = getStartSettings();

  game.running = true;
  game.waitingInput = false;
  game.expectedAction = null;
  game.phase = settings.phase;
  game.maxPhases = settings.maxPhases;
  game.lives = settings.lives;
  game.hits = 0;
  game.misses = 0;
  game.reactionTimes = [];
  game.enemyHits = 0;
  game.enemyHitsNeeded = settings.enemyHitsNeeded;
  game.customMode = settings.customMode;
  game.difficultyPhase = settings.difficultyPhase;
  game.actionHistory = [];

  setRoundControlsVisibility(true);

  resetEnemyPosition();

  const enemy = document.getElementById("enemy");
  enemy.components["enemy-ai"].data.speed = getEnemySpeed(game.phase);
  enemy.components["enemy-ai"].resumeCombat();

  setPrompt("COMEÇOU");
  setPromptState(false);
  if (game.customMode) {
    const livesLabel = isInfinite(game.lives) ? "∞" : String(game.lives);
    const hitsLabel = isInfinite(game.enemyHitsNeeded) ? "∞" : String(game.enemyHitsNeeded);
    setResult(`Modo customizado ativo: fase ${game.phase}, vidas ${livesLabel}, ataques ${hitsLabel}.`);
  } else {
    setResult("Prepare-se.");
  }
  beginPhaseTracking();
  renderPerformanceHistory();
  updateHUD();
}

function resetGame() {
  if (game.running) {
    summarizePhase("interrompida");
  }

  clearTimers();

  game.running = false;
  game.waitingInput = false;
  game.expectedAction = null;
  game.phase = 1;
  game.maxPhases = 3;
  game.lives = 3;
  game.hits = 0;
  game.misses = 0;
  game.reactionTimes = [];
  game.enemyHits = 0;
  game.enemyHitsNeeded = getEnemyHitsNeeded(1);
  game.customMode = false;
  game.difficultyPhase = 1;
  game.actionHistory = [];

  setRoundControlsVisibility(false);

  resetEnemyPosition();

  setPrompt("APERTE INICIAR");
  setPromptState(false);
  setResult("Aguardando...");
  beginPhaseTracking();
  renderPerformanceHistory();
  updateHUD();
}

function dispatchAction(action, source = "unknown") {
  try {
    if (source === "teclado" && window.animateKeyboardCamera) {
      window.animateKeyboardCamera(action);
    }
  } catch (e) {
    console.warn("animateKeyboardCamera failed", e);
  }

  receiveAction(action, source);
}

window.dispatchGameAction = dispatchAction;

document.addEventListener(
  "keydown",
  (event) => {
    const blockedKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (blockedKeys.includes(event.key)) {
      event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }

    if (!game.running) return;

    if (event.key === "ArrowUp") dispatchAction("attack", "teclado");
    if (event.key === "ArrowLeft") dispatchAction("dodgeLeft", "teclado");
    if (event.key === "ArrowRight") dispatchAction("dodgeRight", "teclado");
    if (event.key === "ArrowDown") dispatchAction("duck", "teclado");
  },
  { passive: false, capture: true }
);