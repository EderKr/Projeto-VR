function setPrompt(text) {
  setCanvasText(promptEl, text);
}

function setResult(text, type = "") {
  setCanvasText(resultEl, text);

  if (type === "success") {
    resultBgEl.setAttribute("color", "#1F6B3A");
  } else if (type === "error") {
    resultBgEl.setAttribute("color", "#7A2323");
  } else {
    resultBgEl.setAttribute("color", "#2B2B2B");
  }
}

function setPromptState(active) {
  if (active) {
    promptBgEl.setAttribute("color", "#7A5C00");
    promptBgEl.setAttribute("opacity", "0.97");
  } else {
    promptBgEl.setAttribute("color", "#252525");
    promptBgEl.setAttribute("opacity", "0.96");
  }
}

function updateEnemyHpBar() {
  if (!enemyHpFillEl || !enemyHpTextEl) return;

  if (isInfinite(game.enemyHitsNeeded)) {
    enemyHpFillEl.setAttribute("width", "2.05");
    enemyHpFillEl.setAttribute("position", "0 0 0.025");
    setCanvasText(enemyHpTextEl, "INIMIGO HP ∞");
    return;
  }

  const maxHp = Math.max(1, Number(game.enemyHitsNeeded) || 1);
  const remainingHp = Math.max(0, maxHp - Math.max(0, Number(game.enemyHits) || 0));
  const percent = Math.max(0, Math.min(1, remainingHp / maxHp));
  const fullWidth = 2.05;
  const width = Math.max(0.001, fullWidth * percent);
  const x = -fullWidth / 2 + width / 2;

  enemyHpFillEl.setAttribute("width", String(width));
  enemyHpFillEl.setAttribute("position", `${x} 0 0.025`);
  setCanvasText(enemyHpTextEl, `INIMIGO HP ${remainingHp}/${maxHp}`);
}

function updatePlayerHpBar() {
  if (!playerHpFillEl || !playerHpTextEl) return;

  if (isInfinite(game.lives)) {
    playerHpFillEl.setAttribute("width", "1.66");
    playerHpFillEl.setAttribute("position", "0 0.34 0.035");
    setCanvasText(playerHpTextEl, "SEU HP ∞");
    return;
  }

  const maxHp = Math.max(1, Number(game.maxLives || game.lives) || 1);
  const remainingHp = Math.max(0, Math.min(maxHp, Number(game.lives) || 0));
  const percent = Math.max(0, Math.min(1, remainingHp / maxHp));
  const fullWidth = 1.66;
  const width = Math.max(0.001, fullWidth * percent);
  const x = -fullWidth / 2 + width / 2;

  playerHpFillEl.setAttribute("width", String(width));
  playerHpFillEl.setAttribute("position", `${x} 0.34 0.035`);
  setCanvasText(playerHpTextEl, `SEU HP ${remainingHp}/${maxHp}`);
}

function updateHUD() {
  setCanvasText(phaseEl, `Fase: ${game.phase}`);
  setCanvasText(livesEl, `Vidas: ${isInfinite(game.lives) ? "∞" : game.lives}`);
  setCanvasText(
    hitsOnEnemyEl,
    `Ataques no inimigo: ${game.enemyHits}/${isInfinite(game.enemyHitsNeeded) ? "∞" : game.enemyHitsNeeded}`
  );
  setCanvasText(hitsEl, `Acertos: ${game.hits}`);
  setCanvasText(missesEl, `Erros: ${game.misses}`);
  updateEnemyHpBar();
  updatePlayerHpBar();

  if (game.reactionTimes.length > 0) {
    const avg = game.reactionTimes.reduce((a, b) => a + b, 0) / game.reactionTimes.length;
    setCanvasText(avgReactionEl, `Tempo médio: ${avg.toFixed(3)}s`);
  } else {
    setCanvasText(avgReactionEl, "Tempo médio: --");
  }
}

function resetEnemyPosition() {
  const enemy = document.getElementById("enemy");
  if (!enemy) return;

  enemy.object3D.visible = true;
  enemy.object3D.position.set(0, 0, -5.8);
  enemy.object3D.rotation.set(0, 0, 0);
  enemy.setAttribute("visible", "true");

  const modelsRoot = document.getElementById("enemyModelsRoot");
  if (modelsRoot) {
    modelsRoot.object3D.visible = true;
    modelsRoot.object3D.position.set(0, 0, 0);
    modelsRoot.object3D.rotation.set(0, 0, 0);
  }

  document.querySelectorAll(".enemy-character-model").forEach((model) => {
    model.object3D.visible = model.getAttribute("visible") !== false;
    model.object3D.position.set(0, 0, 0);
    model.object3D.rotation.set(0, 0, 0);
  });
}


function syncEnemyWithSelectedDifficulty(options = {}) {
  const difficulty = typeof getSelectedDifficultyPhase === "function" ? getSelectedDifficultyPhase() : 2;
  game.difficultyPhase = difficulty;

  if (!game.customMode && !game.running) {
    game.enemyHitsNeeded = getEnemyHitsNeeded(difficulty);
  }

  const enemy = document.getElementById("enemy");
  if (enemy && enemy.components && enemy.components["enemy-ai"] && enemy.components["enemy-ai"].setVariantForPhase) {
    enemy.components["enemy-ai"].setVariantForPhase(difficulty);
    if (options.resetPosition !== false) {
      resetEnemyPosition();
    }
  }

  updateHUD();
}

function setSelectedDifficulty(level) {
  const difficulty = Math.min(3, Math.max(1, parseInt(level, 10) || 2));
  if (typeof customDifficultyEl !== "undefined" && customDifficultyEl) {
    customDifficultyEl.value = String(difficulty);
  }

  syncEnemyWithSelectedDifficulty({ resetPosition: true });

  if (typeof updateCustomizeMenuDisplay === "function") {
    updateCustomizeMenuDisplay();
  }

  if (!game.running) {
    setResult(`Dificuldade selecionada: ${getDifficultyLabel(difficulty)}.`);
  }
}

if (typeof customDifficultyEl !== "undefined" && customDifficultyEl) {
  customDifficultyEl.addEventListener("change", () => {
    setSelectedDifficulty(customDifficultyEl.value);
  });
}

const enemyOriginalMaterialColors = new WeakMap();
let enemyFlashTimeoutId = null;
let enemyHeadFlashTimeoutId = null;

function flashEnemy(color = "#ff4444", duration = 180) {
  const head = document.getElementById("enemyHead");
  if (head) {
    const baseHeadColor = head.dataset.baseColor || head.getAttribute("color") || "#f1c27d";
    head.dataset.baseColor = baseHeadColor;

    if (enemyHeadFlashTimeoutId) {
      clearTimeout(enemyHeadFlashTimeoutId);
    }

    head.setAttribute("color", color);
    enemyHeadFlashTimeoutId = setTimeout(() => {
      head.setAttribute("color", baseHeadColor);
      enemyHeadFlashTimeoutId = null;
    }, duration);
  }

  const enemy = document.getElementById("enemy");
  const model = enemy && enemy.components && enemy.components["enemy-ai"]
    ? enemy.components["enemy-ai"].getActiveModelEl()
    : document.querySelector(".enemy-character-model[visible='true']");
  if (!model || !model.object3D) return;

  const THREERef = AFRAME.THREE;
  const flashColor = new THREERef.Color(color);
  const flashedMaterials = [];

  if (enemyFlashTimeoutId) {
    clearTimeout(enemyFlashTimeoutId);
    enemyFlashTimeoutId = null;
  }

  model.object3D.traverse((node) => {
    if (!node.isMesh || !node.material) return;

    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material.color) return;

      if (!enemyOriginalMaterialColors.has(material)) {
        enemyOriginalMaterialColors.set(material, material.color.clone());
      }

      flashedMaterials.push(material);
      material.color.copy(flashColor);
      material.needsUpdate = true;
    });
  });

  enemyFlashTimeoutId = setTimeout(() => {
    flashedMaterials.forEach((material) => {
      const originalColor = enemyOriginalMaterialColors.get(material);
      if (!originalColor || !material.color) return;

      material.color.copy(originalColor);
      material.needsUpdate = true;
    });
    enemyFlashTimeoutId = null;
  }, duration);
}

function getPromptLabel(action) {
  switch (action) {
    case "dodgeLeft":
      return "DESVIAR À ESQUERDA";
    case "dodgeRight":
      return "DESVIAR À DIREITA";
    case "duck":
      return "AGACHAR";
    case "attack":
      return "ATACAR";
    default:
      return "...";
  }
}

function repositionWorldHud() {
  const cam = document.getElementById("playerCamera");
  const hud = document.getElementById("worldHud");
  if (!cam || !hud) return;

  const camWorldPos = new THREE.Vector3();
  const camWorldQuat = new THREE.Quaternion();

  cam.object3D.getWorldPosition(camWorldPos);
  cam.object3D.getWorldQuaternion(camWorldQuat);

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camWorldQuat);
  forward.y = 0;

  if (forward.lengthSq() < 0.0001) {
    forward.set(0, 0, -1);
  } else {
    forward.normalize();
  }

  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camWorldQuat);
  right.y = 0;
  if (right.lengthSq() > 0.0001) right.normalize();

  // Mantém o guia fora do centro da mira. Assim ele não cobre o cursor,
  // mas continua acompanhando a direção geral do jogador.
  const targetPos = camWorldPos.clone()
    .add(forward.multiplyScalar(2.45))
    .add(right.multiplyScalar(1.25));
  targetPos.y = 1.82;
  hud.object3D.position.copy(targetPos);

  const lookTarget = camWorldPos.clone();
  lookTarget.y = 1.82;
  hud.object3D.lookAt(lookTarget);

  hud.object3D.rotation.x = 0;
  hud.object3D.rotation.z = 0;
}

function setRoundControlsVisibility(isRunning) {
  const controlsRoot = document.getElementById("vrControlsRoot");
  const stopButtonGroup = document.getElementById("stopButtonGroup");
  if (!controlsRoot || !stopButtonGroup) return;

  const children = Array.from(controlsRoot.children);
  const pauseOnlyIds = new Set(["customModeVR", "historyPanelVR"]);

  if (isRunning) {
    for (const child of children) {
      if (pauseOnlyIds.has(child.id)) {
        child.setAttribute("visible", "false");
        continue;
      }
      child.setAttribute("visible", "false");
    }

    stopButtonGroup.setAttribute("visible", "true");
  } else {
    for (const child of children) {
      if (pauseOnlyIds.has(child.id)) {
        child.setAttribute("visible", "false");
        continue;
      }
      child.setAttribute("visible", "true");
    }
  }
}

function setDesktopPauseMenuVisible(visible) {
  const menu = document.getElementById("pauseMenuDesktop");
  if (!menu) return;

  menu.classList.toggle("open", Boolean(visible));
  menu.setAttribute("aria-hidden", visible ? "false" : "true");
}

function toggleDesktopPauseMenu() {
  const menu = document.getElementById("pauseMenuDesktop");
  if (!menu) return;
  const isOpen = menu.classList.contains("open");
  setDesktopPauseMenuVisible(!isOpen);
}

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  toggleDesktopPauseMenu();
});

window.addEventListener("load", () => {
  if (typeof customModeEnabledEl !== 'undefined' && customModeEnabledEl) {
    vrMenuState.customModeEnabled = customModeEnabledEl.checked;
  }

  const openBtn = document.getElementById("pauseMenuDesktopToggle");
  const closeBtn = document.getElementById("pauseMenuDesktopClose");
  const menu = document.getElementById("pauseMenuDesktop");

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      toggleDesktopPauseMenu();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      setDesktopPauseMenuVisible(false);
    });
  }

  if (menu) {
    menu.addEventListener("click", (event) => {
      if (event.target === menu) {
        setDesktopPauseMenuVisible(false);
      }
    });
  }

  if (typeof sfxVolumeSelectEl !== "undefined" && sfxVolumeSelectEl) {
    sfxVolumeSelectEl.addEventListener("change", () => {
      setSfxVolume(sfxVolumeSelectEl.value);
    });
    setSfxVolume(sfxVolumeSelectEl.value);
  } else if (typeof setSfxVolume === "function") {
    setSfxVolume(1);
  }
});

const vrMenuState = {
  currentMenu: null,
  isOpen: false,
  previouslyRunning: false,
  customModeEnabled: false,
  currentHistoryTab: 'history'
};

function hideAllVRMenus() {
  const mainScreen = document.getElementById("menuMainScreen");
  const customizeScreen = document.getElementById("menuCustomizeScreen");
  const historyScreen = document.getElementById("menuHistoryScreen");

  if (mainScreen) mainScreen.setAttribute("visible", "false");
  if (customizeScreen) customizeScreen.setAttribute("visible", "false");
  if (historyScreen) historyScreen.setAttribute("visible", "false");
}

function positionVRMenusInFrontOfPlayer() {
  // Mantém o menu de pausa fixo no centro da cena principal,
  // em vez de prendê-lo à direção atual da câmera/jogador.
  // Assim, ao clicar em pause, o painel aparece sempre no mesmo lugar
  // do mundo e não acompanha a cabeça.
  const fixedMenus = [
    { id: "menuMainScreen", position: "0 1.38 -3.25", rotation: "0 0 0", scale: "0.82 0.82 0.82" },
    { id: "menuCustomizeScreen", position: "0 1.46 -3.15", rotation: "0 0 0", scale: "0.82 0.82 0.82" },
    { id: "menuHistoryScreen", position: "0 1.38 -3.35", rotation: "0 0 0", scale: "0.78 0.78 0.78" }
  ];

  for (const item of fixedMenus) {
    const menu = document.getElementById(item.id);
    if (!menu) continue;
    menu.setAttribute("position", item.position);
    menu.setAttribute("rotation", item.rotation);
    menu.setAttribute("scale", item.scale);
  }
}

function setVRMenuOpen(open) {
  const overlay = document.getElementById("menuOverlay");
  if (!overlay) return;

  const pauseButton = document.getElementById("pauseButtonVR");
  const menuCursor = document.getElementById("menuCursorReticle");
  const gazeCursor = document.getElementById("gazeCursor");

  vrMenuState.isOpen = open;
  overlay.setAttribute("visible", String(open));

  if (pauseButton) pauseButton.setAttribute("visible", String(!open));
  if (menuCursor) {
    menuCursor.setAttribute("visible", String(open));
    menuCursor.setAttribute("always-on-top", "order: 10001");
    menuCursor.setAttribute("material", "shader: flat; color: #FFFFFF; depthTest: false; depthWrite: false; transparent: true; opacity: 1; side: double");
  }
  if (gazeCursor) {
    gazeCursor.setAttribute("visible", "true");
    gazeCursor.setAttribute("always-on-top", "order: 10000");
    gazeCursor.setAttribute("material", "shader: flat; color: #FFFFFF; depthTest: false; depthWrite: false; transparent: true; opacity: 1; side: double");
  }

  if (open) {
    vrMenuState.previouslyRunning = game.running;
    game.menuOpen = true;
    if (game.running) {
      game.running = false;
    }
  } else {
    game.menuOpen = false;
    if (vrMenuState.previouslyRunning) {
      game.running = true;
    }
    hideAllVRMenus();
  }
}

function showVRMenu(menuId) {
  if (!vrMenuState.isOpen) return;
  hideAllVRMenus();

  const targetMenu = document.getElementById(menuId);
  if (targetMenu) {
    targetMenu.setAttribute("visible", "true");
    vrMenuState.currentMenu = menuId;
  }
}

function toggleVRPauseMenu() {
  if (vrMenuState.isOpen) {
    closeVRPauseMenu();
  } else {
    openVRPauseMenu();
  }
}

function openVRPauseMenu() {
  setVRMenuOpen(true);
  positionVRMenusInFrontOfPlayer();
  showVRMenu("menuMainScreen");
  updateCustomizeMenuDisplay();
}

function closeVRPauseMenu() {
  setVRMenuOpen(false);
  vrMenuState.currentMenu = null;
}

function openCustomizeMenu() {
  if (!vrMenuState.isOpen) return;
  showVRMenu("menuCustomizeScreen");
  updateCustomizeMenuDisplay();
}

function openHistoryMenu() {
  if (!vrMenuState.isOpen) return;
  showVRMenu("menuHistoryScreen");
  updateHistoryMenuDisplay();
}

function backToMainMenu() {
  if (!vrMenuState.isOpen) return;
  showVRMenu("menuMainScreen");
}

function resumeGame() {
  closeVRPauseMenu();
}

function updateSfxVolumeButtons() {
  const buttons = [
    { id: "sfxVolBtn0", value: 0 },
    { id: "sfxVolBtn25", value: 0.25 },
    { id: "sfxVolBtn50", value: 0.5 },
    { id: "sfxVolBtn100", value: 1 }
  ];
  const currentVolume = typeof game !== "undefined" ? normalizeSfxVolume(game.sfxVolume) : 1;

  for (const item of buttons) {
    const btn = document.getElementById(item.id);
    if (!btn) continue;
    btn.setAttribute("color", currentVolume === item.value ? "#4ECDC4" : "#273242");
  }
}

function updateCustomizeMenuDisplay() {
  const statusEl = document.getElementById("customModeStatus");
  const statusColor = vrMenuState.customModeEnabled ? "#4ECDC4" : "#FF6B6B";
  const statusText = vrMenuState.customModeEnabled ? "ATIVADO" : "DESATIVADO";
  
  if (statusEl) {
    setCanvasText(statusEl, statusText);
    statusEl.setAttribute("color", statusColor);
  }

  const livesDisplay = document.getElementById("customLivesDisplay");
  const enemyDisplay = document.getElementById("customEnemyDisplay");

  if (typeof customLivesEl !== 'undefined' && customLivesEl && livesDisplay) {
    setCanvasText(livesDisplay, String(customLivesEl.value || 3));
  }

  if (typeof customEnemyHitsEl !== 'undefined' && customEnemyHitsEl && enemyDisplay) {
    setCanvasText(enemyDisplay, String(customEnemyHitsEl.value || 3));
  }

  const livesInfiniteBtn = document.getElementById('customLivesInfiniteBtn');
  const enemyInfiniteBtn = document.getElementById('customEnemyInfiniteBtn');

  if (typeof customLivesInfiniteEl !== 'undefined' && customLivesInfiniteEl && livesInfiniteBtn) {
    livesInfiniteBtn.setAttribute('color', customLivesInfiniteEl.checked ? '#4ECDC4' : '#555');
  }

  if (typeof customEnemyHitsInfiniteEl !== 'undefined' && customEnemyHitsInfiniteEl && enemyInfiniteBtn) {
    enemyInfiniteBtn.setAttribute('color', customEnemyHitsInfiniteEl.checked ? '#4ECDC4' : '#555');
  }

  const difficultyBtn1 = document.getElementById('difficultyBtn1');
  const difficultyBtn2 = document.getElementById('difficultyBtn2');
  const difficultyBtn3 = document.getElementById('difficultyBtn3');

  const selectedDifficulty = customDifficultyEl ? parseInt(customDifficultyEl.value, 10) : 1;

  if (difficultyBtn1) {
    difficultyBtn1.setAttribute('color', selectedDifficulty === 1 ? '#4ECDC4' : '#2C6CB0');
  }
  if (difficultyBtn2) {
    difficultyBtn2.setAttribute('color', selectedDifficulty === 2 ? '#4ECDC4' : '#B8A200');
  }
  if (difficultyBtn3) {
    difficultyBtn3.setAttribute('color', selectedDifficulty === 3 ? '#4ECDC4' : '#8B0000');
  }

  updateSfxVolumeButtons();
}

function toggleCustomMode() {
  vrMenuState.customModeEnabled = !vrMenuState.customModeEnabled;
  
  if (typeof customModeEnabledEl !== 'undefined' && customModeEnabledEl) {
    customModeEnabledEl.checked = vrMenuState.customModeEnabled;
  }
  
  const checkboxTextEl = document.getElementById("customModeCheckboxText");
  if (checkboxTextEl) {
    setCanvasText(checkboxTextEl, vrMenuState.customModeEnabled ? '☑' : '☐');
  }
  
  updateCustomizeMenuDisplay();
}

function toggleCustomEnemyInfinite() {
  if (typeof customEnemyHitsInfiniteEl !== 'undefined' && customEnemyHitsInfiniteEl) {
    customEnemyHitsInfiniteEl.checked = !customEnemyHitsInfiniteEl.checked;
  }
  updateCustomizeMenuDisplay();
}

function updateHistoryMenuDisplay() {
  const historyContent = document.getElementById("historyTabContent");
  const aiContent = document.getElementById("aiTabContent");
  
  if (!historyContent) return;

  if (!game.phaseHistory || game.phaseHistory.length === 0) {
    setCanvasText(historyContent, 'Sem dados ainda.\nFinalize uma fase para gerar histórico.');
    return;
  }

  const lines = [];
  lines.push('ÚLTIMAS PARTIDAS\n');
  
  for (let i = 0; i < Math.min(game.phaseHistory.length, 10); i++) {
    const item = game.phaseHistory[i];
    const modeLabel = item.customMode ? `Custom (${getDifficultyLabel(item.difficultyPhase)})` : `Fase ${item.phase}`;
    const statusLabel = item.status === 'concluida' ? '✓' : (item.status === 'derrota' ? '✗' : '⊘');
    const time = formatSeconds(item.duration || 0);
    const acc = item.accuracy != null ? `${Number(item.accuracy).toFixed(1)}%` : '--';
    lines.push(`${i+1}. ${modeLabel} ${statusLabel}\n   ${time} | ${acc}`);
    if (i < game.phaseHistory.length - 1) lines.push('\n');
  }

  setCanvasText(historyContent, lines.join(''));
}


function buildAssistantRecommendations() {
  const entries = Array.isArray(game.phaseHistory) ? game.phaseHistory : [];

  if (entries.length === 0) {
    return 'ASSISTENTE IA\n\nSem histórico suficiente.\n\nFinalize pelo menos uma fase para receber recomendações de treino.';
  }

  const recent = entries.slice(0, 6);
  let attempts = 0;
  let hits = 0;
  let misses = 0;
  let timeouts = 0;
  let reactionSum = 0;
  let reactionSamples = 0;
  const byAction = {};

  for (const actionType of ACTION_TYPES) {
    byAction[actionType] = { attempts: 0, hits: 0, misses: 0, timeouts: 0, reactionSum: 0, reactionSamples: 0 };
  }

  for (const entry of recent) {
    const actions = Array.isArray(entry.actions) ? entry.actions : [];
    for (const action of actions) {
      const actionType = isKnownAction(action.expectedAction) ? action.expectedAction : 'attack';
      const bucket = byAction[actionType];
      attempts += 1;
      bucket.attempts += 1;

      if (action.outcome === 'success') {
        hits += 1;
        bucket.hits += 1;
        if (Number.isFinite(action.reactionTime)) {
          reactionSum += action.reactionTime;
          reactionSamples += 1;
          bucket.reactionSum += action.reactionTime;
          bucket.reactionSamples += 1;
        }
      } else {
        misses += 1;
        bucket.misses += 1;
        if (action.outcome === 'timeout') {
          timeouts += 1;
          bucket.timeouts += 1;
        }
      }
    }
  }

  const accuracy = attempts > 0 ? (hits / attempts) * 100 : 0;
  const timeoutRate = attempts > 0 ? (timeouts / attempts) * 100 : 0;
  const avgReaction = reactionSamples > 0 ? reactionSum / reactionSamples : null;
  const weakestAction = ACTION_TYPES
    .filter((actionType) => byAction[actionType].attempts > 0)
    .sort((a, b) => {
      const accA = byAction[a].hits / byAction[a].attempts;
      const accB = byAction[b].hits / byAction[b].attempts;
      return accA - accB;
    })[0];

  const lines = [];
  lines.push('ASSISTENTE IA');
  lines.push('Base: últimas ' + recent.length + ' fases');
  lines.push('');
  lines.push('Precisão: ' + accuracy.toFixed(1) + '%');
  lines.push('Tempo médio: ' + (avgReaction == null ? '--' : avgReaction.toFixed(3) + 's'));
  lines.push('Timeouts: ' + timeoutRate.toFixed(1) + '%');
  lines.push('');

  const recommendations = [];

  if (attempts < 8) {
    recommendations.push('Jogue mais 2-3 rodadas para calibrar a análise.');
  }

  if (accuracy >= 80 && avgReaction != null && avgReaction <= 0.9) {
    recommendations.push('Você está pronto para aumentar a dificuldade.');
  } else if (accuracy < 55) {
    recommendations.push('Reduza a dificuldade e foque em precisão antes de velocidade.');
  } else if (accuracy < 70) {
    recommendations.push('Treine uma rodada curta no modo customizado com mais vidas.');
  }

  if (avgReaction != null && avgReaction > 1.15) {
    recommendations.push('Seu tempo de reação está alto: antecipe o comando visual.');
  }

  if (timeoutRate > 25) {
    recommendations.push('Muitos timeouts: aumente vidas ou reduza fase no modo customizado.');
  }

  if (weakestAction) {
    const weak = byAction[weakestAction];
    const weakAccuracy = (weak.hits / weak.attempts) * 100;
    recommendations.push('Ponto fraco: ' + getActionLabel(weakestAction) + ' (' + weakAccuracy.toFixed(0) + '%).');
  }

  if (misses === 0 && attempts >= 8) {
    recommendations.push('Sequência perfeita recente: tente fase difícil.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Desempenho estável: mantenha séries curtas e consistentes.');
  }

  lines.push('RECOMENDAÇÕES');
  for (let i = 0; i < Math.min(4, recommendations.length); i++) {
    lines.push('- ' + recommendations[i]);
  }

  return lines.join('\n');
}

function updateAIAssistantDisplay() {
  const aiContent = document.getElementById('aiTabContent');
  if (!aiContent) return;
  setCanvasText(aiContent, buildAssistantRecommendations());
}

function updateVRHistory() {
  if (vrMenuState.currentHistoryTab === 'ai') {
    updateAIAssistantDisplay();
  } else {
    updateHistoryMenuDisplay();
  }
}

function selectHistoryTab() {
  vrMenuState.currentHistoryTab = 'history';
  
  const historyContent = document.getElementById("historyTabContent");
  const aiContent = document.getElementById("aiTabContent");
  const tabHistoryBtn = document.getElementById("tabHistoryBtn");
  const tabAIBtn = document.getElementById("tabAIBtn");
  
  if (historyContent) historyContent.setAttribute("visible", "true");
  if (aiContent) aiContent.setAttribute("visible", "false");
  if (tabHistoryBtn) tabHistoryBtn.setAttribute("color", "#2C5AA0");
  if (tabAIBtn) tabAIBtn.setAttribute("color", "#555555");
  
  updateHistoryMenuDisplay();
}

function selectAITab() {
  vrMenuState.currentHistoryTab = 'ai';
  
  const historyContent = document.getElementById("historyTabContent");
  const aiContent = document.getElementById("aiTabContent");
  const tabHistoryBtn = document.getElementById("tabHistoryBtn");
  const tabAIBtn = document.getElementById("tabAIBtn");
  
  if (historyContent) historyContent.setAttribute("visible", "false");
  if (aiContent) aiContent.setAttribute("visible", "true");
  if (tabHistoryBtn) tabHistoryBtn.setAttribute("color", "#555555");
  if (tabAIBtn) tabAIBtn.setAttribute("color", "#2C5AA0");

  updateAIAssistantDisplay();
}

window.animateKeyboardCamera = function (action) {
  try {
    const scene = document.querySelector('a-scene');
    if (scene && typeof scene.is === 'function' && scene.is('vr-mode')) return;

    const rig = document.getElementById('rig');
    if (!rig || !rig.object3D) return;

    const obj = rig.object3D;

    if (obj._kbdAnimCancel) {
      obj._kbdAnimCancel();
      obj._kbdAnimCancel = null;
    }

    const startPos = obj.position.clone();
    const startQuat = obj.quaternion.clone();

    const toPos = startPos.clone();
    const deltaEuler = { x: 0, y: 0, z: 0 };

    if (action === 'dodgeLeft') {
      deltaEuler.z = 0.11;
      toPos.x -= 0.03;
    } else if (action === 'dodgeRight') {
      deltaEuler.z = -0.11;
      toPos.x += 0.03;
    } else if (action === 'duck') {
      toPos.y -= 0.18;
    } else if (action === 'attack') {
      deltaEuler.x = -0.07;
      toPos.z -= 0.03;
    } else {
      return;
    }

    const tempEuler = new THREE.Euler(deltaEuler.x, deltaEuler.y, deltaEuler.z, 'YXZ');
    const deltaQuat = new THREE.Quaternion().setFromEuler(tempEuler);
    const targetQuat = startQuat.clone().multiply(deltaQuat);

    const durationTo = 140;
    const hold = 80;
    const durationBack = 260;

    let startTime = null;
    let phase = 'to';

    function lerp(a, b, t) { return a + (b - a) * t; }

    function step(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;

      if (phase === 'to') {
        const t = Math.min(1, elapsed / durationTo);
        obj.position.lerpVectors(startPos, toPos, t);
        obj.quaternion.slerpQuaternions(startQuat, targetQuat, t);
        if (t >= 1) {
          phase = 'hold';
          startTime = ts;
        }
      } else if (phase === 'hold') {
        if (elapsed >= hold) {
          phase = 'back';
          startTime = ts;
        }
      } else if (phase === 'back') {
        const t = Math.min(1, elapsed / durationBack);
        obj.position.lerpVectors(toPos, startPos, t);
        obj.quaternion.slerpQuaternions(targetQuat, startQuat, t);
        if (t >= 1) {
          obj.position.copy(startPos);
          obj.quaternion.copy(startQuat);
          obj._kbdAnimCancel = null;
          return;
        }
      }

      obj._kbdAnimFrame = requestAnimationFrame(step);
    }

    obj._kbdAnimCancel = () => {
      if (obj._kbdAnimFrame) cancelAnimationFrame(obj._kbdAnimFrame);
      obj.position.copy(startPos);
      obj.quaternion.copy(startQuat);
      obj._kbdAnimCancel = null;
    };

    obj._kbdAnimFrame = requestAnimationFrame(step);
  } catch (e) {
    console.warn('animateKeyboardCamera error', e);
  }
};