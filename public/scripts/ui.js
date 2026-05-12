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

function updateHUD() {
  setCanvasText(phaseEl, `Fase: ${game.phase}`);
  setCanvasText(livesEl, `Vidas: ${isInfinite(game.lives) ? "∞" : game.lives}`);
  setCanvasText(
    hitsOnEnemyEl,
    `Ataques no inimigo: ${game.enemyHits}/${isInfinite(game.enemyHitsNeeded) ? "∞" : game.enemyHitsNeeded}`
  );
  setCanvasText(hitsEl, `Acertos: ${game.hits}`);
  setCanvasText(missesEl, `Erros: ${game.misses}`);

  if (game.reactionTimes.length > 0) {
    const avg = game.reactionTimes.reduce((a, b) => a + b, 0) / game.reactionTimes.length;
    setCanvasText(avgReactionEl, `Tempo médio: ${avg.toFixed(3)}s`);
  } else {
    setCanvasText(avgReactionEl, "Tempo médio: --");
  }
}

function resetEnemyPosition() {
  const enemy = document.getElementById("enemy");
  enemy.setAttribute("position", "0 0 -8");
}

function flashEnemy(color = "#ff4444", duration = 180) {
  const head = document.getElementById("enemyHead");
  const oldColor = head.getAttribute("color") || "#f1c27d";
  head.setAttribute("color", color);
  setTimeout(() => {
    head.setAttribute("color", oldColor);
  }, duration);
}

function getPromptLabel(action) {
  switch (action) {
    case "dodgeLeft":
      return "← DESVIAR";
    case "dodgeRight":
      return "→ DESVIAR";
    case "duck":
      return "↓ AGACHAR";
    case "attack":
      return "↑ ATACAR";
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

  const targetPos = camWorldPos.clone().add(forward.multiplyScalar(2.4));
  targetPos.y = 1.9;
  hud.object3D.position.copy(targetPos);

  const lookTarget = camWorldPos.clone();
  lookTarget.y = 1.9;
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

function setVRMenuOpen(open) {
  const overlay = document.getElementById("menuOverlay");
  if (!overlay) return;

  vrMenuState.isOpen = open;
  overlay.setAttribute("visible", String(open));

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