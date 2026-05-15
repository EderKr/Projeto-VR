function openPrompt(action, options = {}) {
  clearTimers();
  game.expectedAction = action;
  game.waitingInput = true;
  game.promptStartTime = performance.now();

  const label = options.label || getPromptLabel(action);
  const resultText = options.resultText || "Reaja agora.";

  setPrompt(label);
  setPromptState(true);
  setResult(resultText);

  // store pending attack SFX so we can play hit SFX if the player is struck
  game.pendingAttackSfx = {
    swing: options.attackSfxSwing || null,
    hit: options.attackSfxHit || null
  };

  game.reactionTimeoutId = setTimeout(() => {
    handleTimeout();
  }, getReactionWindow(getActiveDifficultyPhase()));
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
    // play hit sfx if provided by the attacker
    try {
      if (game.pendingAttackSfx && game.pendingAttackSfx.hit) {
        playSfx(game.pendingAttackSfx.hit);
      }
    } catch (e) {
      console.warn('play hit sfx failed', e);
    }
  }

  updateHUD();
  // clear pending attack sfx (handled on timeout/hit)
  try { game.pendingAttackSfx = null; } catch (e) {}
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
      // play hit sfx when player responded incorrectly
      try {
        if (game.pendingAttackSfx && game.pendingAttackSfx.hit) {
          playSfx(game.pendingAttackSfx.hit);
        }
      } catch (e) {
        console.warn('play hit sfx failed', e);
      }
      setResult(`Resposta errada via ${source}. Você foi atingido.`, "error");
    }
  }

  // clear pending sfx after resolving hit/timeout
  try { game.pendingAttackSfx = null; } catch (e) {}

   updateHUD();
   checkGameStateOrContinue();
}

function nextPhase() {
  const enemy = document.getElementById("enemy");

  if (game.phase >= game.maxPhases) {
    summarizePhase("concluida");
    game.running = false;
    setRoundControlsVisibility(false);
    setPrompt("VITÓRIA");
    setPromptState(false);
    setResult(`${getEnemyDisplayName(getActiveDifficultyPhase())} foi derrotado(a)!`, "success");
    clearTimers();

    if (enemy && enemy.components["enemy-ai"]) {
      enemy.components["enemy-ai"].defeat();
    }
    return;
  }

  if (enemy && enemy.components["enemy-ai"]) {
    setPrompt("INIMIGO DERROTADO");
    setPromptState(false);
    setResult(`${getEnemyDisplayName(getActiveDifficultyPhase())} caiu. Próxima fase em instantes.`, "success");
    enemy.components["enemy-ai"].defeat(() => {
      advanceToNextPhaseAfterDeath();
    });
    return;
  }

  advanceToNextPhaseAfterDeath();
}

function advanceToNextPhaseAfterDeath() {

  summarizePhase("concluida");

  game.phase++;
  game.enemyHits = 0;
  game.enemyHitsNeeded = getEnemyHitsNeeded(getActiveDifficultyPhase());

  const enemy = document.getElementById("enemy");
  enemy.components["enemy-ai"].data.speed = getEnemySpeed(getActiveDifficultyPhase());
  if (enemy.components["enemy-ai"].setVariantForPhase) {
    enemy.components["enemy-ai"].setVariantForPhase(getActiveDifficultyPhase());
  }
  resetEnemyPosition();

  setPrompt(`FASE ${game.phase}`);
  setPromptState(false);
  setResult(`${getEnemyDisplayName(getActiveDifficultyPhase())} continua na arena.`);
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
    // play enemy win sfx for current enemy
    try {
      const phase = getActiveDifficultyPhase();
      const profile = typeof getEnemyProfile === 'function' ? getEnemyProfile(phase) : null;
      const key = profile && profile.key ? profile.key : null;
      let winId = null;
      if (key === 'king') winId = 'king-win';
      else if (key === 'adventurer') winId = 'adventure-win';
      else if (key === 'witch') winId = 'witch-win';
      if (winId) {
        playSfx(winId);
      }
    } catch (e) {
      console.warn('play enemy win sfx failed', e);
    }

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
  game.maxLives = settings.lives;
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
  enemy.components["enemy-ai"].data.speed = getEnemySpeed(getActiveDifficultyPhase());
  if (enemy.components["enemy-ai"].setVariantForPhase) {
    enemy.components["enemy-ai"].setVariantForPhase(getActiveDifficultyPhase());
  }
  enemy.components["enemy-ai"].resumeCombat();

  setPrompt("COMEÇOU");
  setPromptState(false);
  if (game.customMode) {
    const livesLabel = isInfinite(game.lives) ? "∞" : String(game.lives);
    const hitsLabel = isInfinite(game.enemyHitsNeeded) ? "∞" : String(game.enemyHitsNeeded);
    setResult(`Modo customizado ativo: ${getDifficultyLabel(getActiveDifficultyPhase())}, vidas ${livesLabel}, ataques ${hitsLabel}.`);
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
  game.maxLives = 3;
  game.hits = 0;
  game.misses = 0;
  game.reactionTimes = [];
  game.enemyHits = 0;
  game.difficultyPhase = getSelectedDifficultyPhase();
  game.enemyHitsNeeded = getEnemyHitsNeeded(game.difficultyPhase);
  game.customMode = false;
  game.actionHistory = [];

  setRoundControlsVisibility(false);

  resetEnemyPosition();

  const enemy = document.getElementById("enemy");
  if (enemy && enemy.components["enemy-ai"] && enemy.components["enemy-ai"].setVariantForPhase) {
    enemy.components["enemy-ai"].setVariantForPhase(getActiveDifficultyPhase());
  }

  setPrompt("APERTE INICIAR");
  setPromptState(false);
  setResult("Aguardando...");
  beginPhaseTracking();
  renderPerformanceHistory();
  updateHUD();
}

function dispatchAction(action, source = "unknown") {
  const activeProfile = typeof getEnemyProfile === "function" ? getEnemyProfile(getActiveDifficultyPhase()) : null;
  if (action === "duck" && activeProfile && activeProfile.key === "king") {
    setResult("Contra o Rei, use esquiva lateral ou ataque.");
    return;
  }

  try {
    if (source === "teclado" && window.animateKeyboardCamera) {
      window.animateKeyboardCamera(action);
    }
  } catch (e) {
    console.warn("animateKeyboardCamera failed", e);
  }

  // play headbutt sound whenever player attacks
  try {
    if (action === 'attack') {
      playSfx('headbutt');
    }
  } catch (e) {
    console.warn('play headbutt failed', e);
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