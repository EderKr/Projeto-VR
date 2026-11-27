// Identificador único por janela de reação; o controlador da câmera só
// considera um gesto consumido se dispatchGameAction devolver true.
let inputPromptId = 0;
let poseTrackingReady = true;
let reactionDeadline = 0;
let reactionRemaining = 0;
let trackingPausedAt = null;

// Relógio do combate: não congela a webcam nem a interface HTML.
let manualPauseAt = null;
let pausedTotal = 0;
const combatTimers = new Set();
function combatNow() {
  return (manualPauseAt ?? performance.now()) - pausedTotal;
}
function armCombatTimer(timer) {
  timer.deadline = combatNow() + timer.remaining;
  timer.nativeId = setTimeout(() => {
    combatTimers.delete(timer);
    timer.nativeId = null;
    timer.callback();
  }, timer.remaining);
}
function setCombatTimeout(callback, delay) {
  const timer = { callback, remaining: delay, deadline: 0, nativeId: null };
  combatTimers.add(timer);
  if (manualPauseAt === null) armCombatTimer(timer);
  return timer;
}
function clearCombatTimeout(timer) {
  if (!timer || !combatTimers.delete(timer)) return;
  if (timer.nativeId != null) clearTimeout(timer.nativeId);
  timer.nativeId = null;
}
function clearCombatTimers() {
  for (const timer of combatTimers) clearCombatTimeout(timer);
}
function scheduleReactionTimeout() {
  if (!poseTrackingReady || game.paused || !game.running || !game.waitingInput) return;
  reactionDeadline = performance.now() + reactionRemaining;
  game.reactionTimeoutId = setTimeout(handleTimeout, reactionRemaining);
}
function syncInputSuspension() {
  if (!game.running || !game.waitingInput) return;
  if (!poseTrackingReady || game.paused) {
    if (trackingPausedAt != null) return;
    trackingPausedAt = performance.now();
    if (game.reactionTimeoutId != null) {
      reactionRemaining = Math.max(0, reactionDeadline - trackingPausedAt);
      clearTimeout(game.reactionTimeoutId);
      game.reactionTimeoutId = null;
    }
  } else if (trackingPausedAt != null) {
    game.promptStartTime += performance.now() - trackingPausedAt;
    trackingPausedAt = null;
    scheduleReactionTimeout();
  }
}
function setGamePaused(paused) {
  paused = Boolean(paused) && game.running;
  if (paused === Boolean(game.paused)) return;
  if (paused) {
    manualPauseAt = performance.now();
    for (const timer of combatTimers) {
      timer.remaining = Math.max(0, timer.deadline - combatNow());
      if (timer.nativeId != null) clearTimeout(timer.nativeId);
      timer.nativeId = null;
    }
  } else {
    const duration = performance.now() - manualPauseAt;
    pausedTotal += duration;
    game.phaseStartTime += duration;
    manualPauseAt = null;
    for (const timer of combatTimers) armCombatTimer(timer);
  }
  game.paused = paused;
  syncInputSuspension();
}
window.setPoseTrackingReady = function (ready) {
  ready = Boolean(ready);
  if (ready === poseTrackingReady) return;
  poseTrackingReady = ready;
  syncInputSuspension();
  updateMatchButton();
};
window.isPoseTrackingReady = () => poseTrackingReady;

function getEnemyAi() {
  const enemy = document.getElementById("enemy");
  return enemy && enemy.components ? enemy.components["enemy-ai"] : null;
}

// Um único estado controla tanto a IA quanto o botão e o gesto.
function combatIsActive() {
  return game.running && !game.awaitingEnemyStart && !game.paused;
}

function getMatchCommand() {
  if (game.running) return game.awaitingEnemyStart ? "Iniciar fase" : "Encerrar partida";
  if (!game.sessionReady) return null;
  return game.finished ? "Jogar novamente" : "Iniciar jogo";
}

function updateMatchButton() {
  const button = document.getElementById("computerVisionRestart");
  const label = getMatchCommand();
  if (button) {
    button.hidden = !label;
    if (label) button.textContent = label;
    button.disabled = Boolean(label && label !== "Encerrar partida" && !poseTrackingReady);
  }
}

function prepareEnemyStandby() {
  const enemyAi = getEnemyAi();
  if (!enemyAi) return;
  // A troca de modelo pode reconfigurar canAttack; bloquear também no tick.
  enemyAi.canAttack = false;
  if (typeof enemyAi.stopVisualFx === "function") enemyAi.stopVisualFx();
  if (typeof enemyAi.resetActionState === "function") enemyAi.resetActionState();
  if (typeof enemyAi.playIdle === "function") enemyAi.playIdle();
}

function queueEnemyStart() {
  clearTimers();
  game.waitingInput = false;
  game.awaitingEnemyStart = true;
  game.expectedAction = null;
  trackingPausedAt = null;
  reactionDeadline = reactionRemaining = 0;
  prepareEnemyStandby();
  setPrompt(`FASE ${game.phase} PRONTA`);
  setPromptState(false);
  setResult("Clique em Iniciar fase ou coloque as mãos na cintura para continuar.");
  updateMatchButton();
  updateHUD();
}

function triggerEnemyStart(source = "gesto") {
  if (!game.running || game.paused || !game.awaitingEnemyStart || !poseTrackingReady) return false;
  const enemyAi = getEnemyAi();
  if (!enemyAi) return false;
  game.awaitingEnemyStart = false;
  beginPhaseTracking();
  enemyAi.resumeCombat();
  setPrompt(`FASE ${game.phase}`);
  setPromptState(false);
  setResult(`${getEnemyDisplayName(getActiveDifficultyPhase())} entrou em combate via ${source}.`, "success");
  updateMatchButton();
  updateHUD();
  return true;
}

// A calibração e as configurações apenas deixam a partida pronta.
function prepareGameStart({ keepMenu = false } = {}) {
  const menu = document.getElementById("pauseMenuDesktop");
  const wasOpen = keepMenu && menu?.classList?.contains("open");
  game.sessionReady = true;
  resetGame();
  const hud = document.getElementById("computerVisionHud");
  if (hud) hud.hidden = false;
  setPrompt("JOGO PRONTO");
  setResult("Clique em Iniciar jogo ou coloque as mãos na cintura.");
  updateMatchButton();
  if (wasOpen && typeof setDesktopPauseMenuVisible === "function") setDesktopPauseMenuVisible(true);
  return true;
}

function runMatchCommand(source = "botão") {
  const label = getMatchCommand();
  if (!label) return false;
  if (label === "Encerrar partida") {
    if (game.paused) return false;
    resetGame();
    setPrompt("PARTIDA ENCERRADA");
    setResult("Clique em Iniciar jogo ou coloque as mãos na cintura para começar novamente.");
    return true;
  }
  if (!poseTrackingReady || !getEnemyAi()) return false;
  if (label === "Iniciar fase") return triggerEnemyStart(source);
  return startGame();
}
window.runMatchCommand = runMatchCommand;
window.prepareGameStart = prepareGameStart;
window.triggerEnemyStart = triggerEnemyStart;

function openPrompt(action, options = {}) {
  if (!combatIsActive()) return false;
  clearTimers();
  game.expectedAction = action;
  game.waitingInput = true;
  game.promptStartTime = performance.now();
  inputPromptId += 1;
  trackingPausedAt = poseTrackingReady && !game.paused ? null : game.promptStartTime;

  const label = options.label || getPromptLabel(action);
  const resultText = options.resultText || "Reaja agora.";

  setPrompt(label);
  setPromptState(true);
  setResult(resultText);

  game.pendingAttackSfx = {
    swing: options.attackSfxSwing || null,
    hit: options.attackSfxHit || null
  };

  reactionRemaining = getReactionWindow(getActiveDifficultyPhase());
  scheduleReactionTimeout();
}

function handleTimeout() {
  if (!game.running || game.paused || !game.waitingInput || !poseTrackingReady) return;

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
    try {
      if (game.pendingAttackSfx && game.pendingAttackSfx.hit) {
        playSfx(game.pendingAttackSfx.hit);
      }
    } catch (e) {
      console.warn('play hit sfx failed', e);
    }
  }

  updateHUD();
  try { game.pendingAttackSfx = null; } catch (e) {}
  checkGameStateOrContinue();
}

function receiveAction(action, source = "unknown") {
  if (!game.running || game.paused || !game.waitingInput) return false;

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
      const enemy = document.getElementById("enemy");
      if (enemy && enemy.components["enemy-ai"] && typeof enemy.components["enemy-ai"].reactToHit === "function") {
        enemy.components["enemy-ai"].reactToHit();
      }
      setResult(`Soco acertado via ${source}!`, "success");
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

  try { game.pendingAttackSfx = null; } catch (e) {}

   updateHUD();
   checkGameStateOrContinue();
   return true;
}

function nextPhase() {
  const enemy = document.getElementById("enemy");

  if (game.phase >= game.maxPhases) {
    summarizePhase("concluida");
    game.running = false;
    game.awaitingEnemyStart = false;
    game.finished = true;
    game.sessionReady = true;
    setRoundControlsVisibility(false);
    setPrompt("VITÓRIA");
    setPromptState(false);
    setResult(`${getEnemyDisplayName(getActiveDifficultyPhase())} foi derrotado(a)!`, "success");
    updateMatchButton();
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
  if (!game.running) return;
  summarizePhase("concluida");

  game.phase = typeof getNextPlayablePhase === "function" ? getNextPlayablePhase(game.phase) : game.phase + 1;
  game.enemyHits = 0;
  game.enemyHitsNeeded = getEnemyHitsNeeded(getActiveDifficultyPhase());
  game.awaitingEnemyStart = true;

  const enemy = document.getElementById("enemy");
  enemy.components["enemy-ai"].data.speed = getEnemySpeed(getActiveDifficultyPhase());
  if (enemy.components["enemy-ai"].setVariantForPhase) {
    enemy.components["enemy-ai"].setVariantForPhase(getActiveDifficultyPhase());
  }
  resetEnemyPosition();

  queueEnemyStart();
}

function checkGameStateOrContinue() {
  if (!isInfinite(game.lives) && game.lives <= 0) {
    try {
      const phase = getActiveDifficultyPhase();
      const profile = typeof getEnemyProfile === 'function' ? getEnemyProfile(phase) : null;
      const key = profile && profile.key ? profile.key : null;
      let winId = null;
      if (key === 'king') winId = 'king-win';
      else if (key === 'dwarf') winId = 'dwarf-win';
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
    game.awaitingEnemyStart = false;
    game.finished = true;
    game.sessionReady = true;
    setRoundControlsVisibility(false);
    setPrompt("DERROTA");
    setPromptState(false);
    setResult("Você perdeu todas as vidas.", "error");
    updateMatchButton();
    clearTimers();
    return;
  }

  if (!isInfinite(game.enemyHitsNeeded) && game.enemyHits >= game.enemyHitsNeeded) {
    nextPhase();
    return;
  }

  game.nextRoundTimeoutId = setCombatTimeout(() => {
    if (combatIsActive()) {
      document.getElementById("enemy").components["enemy-ai"].resumeCombat();
    }
  }, 900);
}

function startGame() {
  if (game.running || !poseTrackingReady || !getEnemyAi()) return false;
  clearTimers();
  clearCombatTimers();
  if (typeof setDesktopPauseMenuVisible === "function") setDesktopPauseMenuVisible(false);
  setGamePaused(false);
  clearTimers();
  const enemyHpHud = document.getElementById("enemyHpHud");
  if (enemyHpHud) enemyHpHud.hidden = false;

  const computerVisionHud = document.getElementById("computerVisionHud");
  if (computerVisionHud) computerVisionHud.hidden = false;

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
  game.sessionReady = true;
  game.finished = false;
  game.waitingInput = false;
  game.awaitingEnemyStart = false;
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
  game.jumpDisabled = Boolean(settings.jumpDisabled);
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
  setResult(game.customMode ? `Modo personalizado: ${getDifficultyLabel(getActiveDifficultyPhase())}.` : "Prepare-se.");
  beginPhaseTracking();
  renderPerformanceHistory();
  updateMatchButton();
  updateHUD();
  return true;
}

function resetGame({ keepReady = game.sessionReady } = {}) {
  clearTimers();
  clearCombatTimers();
  if (typeof setDesktopPauseMenuVisible === "function") setDesktopPauseMenuVisible(false);
  setGamePaused(false);
  clearTimers();
  const enemyHpHud = document.getElementById("enemyHpHud");
  if (enemyHpHud) enemyHpHud.hidden = true;
  if (game.running && !game.awaitingEnemyStart) {
    summarizePhase("interrompida");
  }

  game.running = false;
  game.sessionReady = Boolean(keepReady);
  game.finished = false;
  game.awaitingEnemyStart = false;
  game.waitingInput = false;
  game.expectedAction = null;
  game.phase = 1;
  game.maxPhases = 4;
  game.lives = 3;
  game.maxLives = 3;
  game.hits = 0;
  game.misses = 0;
  game.reactionTimes = [];
  game.enemyHits = 0;
  game.jumpDisabled = customDisableJumpEl ? Boolean(customDisableJumpEl.checked) : false;
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

  prepareEnemyStandby();
  setPrompt("APERTE INICIAR");
  setPromptState(false);
  setResult("Aguardando...");
  renderPerformanceHistory();
  updateMatchButton();
  updateHUD();
}

function dispatchAction(action, source = "unknown") {
  // A câmera virtual também se move durante animações. O antigo detector
  // de cabeça não deve converter esses movimentos em comandos da webcam.
  if (source === "cabeça" && typeof window.isPoseGameControlEnabled === "function" && window.isPoseGameControlEnabled()) return false;
  if (!game.running || game.paused || !game.waitingInput || !ACTION_TYPES.includes(action)) return false;
  if (!poseTrackingReady && source !== "teclado") return false;
  const activeProfile = typeof getEnemyProfile === "function" ? getEnemyProfile(getActiveDifficultyPhase()) : null;
  if (action === "jump" && typeof isJumpDisabled === "function" && isJumpDisabled()) {
    setResult("Pulo desativado no menu de personalização.");
    return false;
  }
  if (action === "duck" && activeProfile && activeProfile.key === "king") {
    setResult("Contra o Rei, use esquiva lateral ou ataque.");
    return false;
  }

  try {
    if ((source === "teclado" || source === "visão corporal") && window.animateKeyboardCamera) {
      window.animateKeyboardCamera(action);
    }
  } catch (e) {
    console.warn("animateKeyboardCamera failed", e);
  }

  try {
    if (action === 'attack') {
      playSfx('player-attack');
    }
  } catch (e) {
    console.warn('play player attack sound failed', e);
  }

  return receiveAction(action, source);
}

window.dispatchGameAction = dispatchAction;
window.getGameInputState = function () {
  return {
    running: Boolean(game.running),
    paused: Boolean(game.paused),
    waitingInput: Boolean(game.waitingInput),
    awaitingEnemyStart: Boolean(game.awaitingEnemyStart),
    sessionReady: Boolean(game.sessionReady),
    matchCommand: getMatchCommand(),
    expectedAction: game.expectedAction,
    promptId: inputPromptId,
    promptStartTime: game.promptStartTime,
    trackingReady: poseTrackingReady
  };
};

const matchButton = document.getElementById("computerVisionRestart");
if (matchButton) matchButton.addEventListener("click", () => runMatchCommand("botão"));

function handleMatchSettingsChange(event) {
  if (!game.sessionReady) return;
  const modeEnabled = Boolean(document.getElementById("customModeEnabled")?.checked);
  if (event.target.id !== "customModeEnabled" && event.target.id !== "customDisableJump" && !modeEnabled) return;
  prepareGameStart({ keepMenu: true });
  setResult("Configurações prontas. Feche o menu e clique em Iniciar jogo, ou coloque as mãos na cintura.");
}
for (const id of ["customModeEnabled", "customLives", "customLivesInfinite", "customEnemyHits", "customEnemyHitsInfinite", "customDifficulty", "customDisableJump"]) {
  document.getElementById(id)?.addEventListener?.("change", handleMatchSettingsChange);
}

document.addEventListener(
  "keydown",
  (event) => {
    const blockedKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "];
    if (blockedKeys.includes(event.key) || event.code === "Space") {
      event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }

    if (!game.running) return;

    if (event.key === "ArrowUp") dispatchAction("attack", "teclado");
    if (event.key === "ArrowLeft") dispatchAction("dodgeLeft", "teclado");
    if (event.key === "ArrowRight") dispatchAction("dodgeRight", "teclado");
    if (event.key === "ArrowDown") dispatchAction("duck", "teclado");
    if (event.code === "Space") dispatchAction("jump", "teclado");
  },
  { passive: false, capture: true }
);
