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

AFRAME.registerComponent("canvas-text", {
  schema: {
    value: { type: "string", default: "" },
    color: { type: "string", default: "#FFFFFF" },
    align: { type: "string", default: "left" },
    fontSize: { type: "number", default: 56 },
    padding: { type: "number", default: 20 },
    fontFamily: { type: "string", default: "Arial, sans-serif" },
    lineHeight: { type: "number", default: 1.2 }
  },

  init: function () {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1024;
    this.canvas.height = 256;
    this.lastCanvasSize = "1024x256";
    this.ctx = this.canvas.getContext("2d");

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.needsUpdate = true;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    this.applyTexture = this.applyTexture.bind(this);

    if (this.el.getObject3D("mesh")) {
      this.applyTexture();
    } else {
      this.el.addEventListener("object3dset", this.applyTexture);
    }

    this.draw();
  },

  update: function () {
    this.draw();
  },

  remove: function () {
    this.el.removeEventListener("object3dset", this.applyTexture);
    if (this.texture) this.texture.dispose();
  },

  applyTexture: function () {
    const mesh = this.el.getObject3D("mesh");
    if (!mesh) return;

    this.resizeCanvasToElement();

    const applyToMaterial = (mat) => {
      mat.map = this.texture;
      mat.transparent = true;
      mat.opacity = 1;
      mat.color.set("#FFFFFF");
      mat.alphaTest = 0.01;
      mat.needsUpdate = true;
    };

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(applyToMaterial);
    } else {
      applyToMaterial(mesh.material);
    }
  },

  resizeCanvasToElement: function () {
    let widthUnits = Number(this.el.getAttribute("width")) || 1;
    let heightUnits = Number(this.el.getAttribute("height")) || 1;

    const geometry = this.el.getAttribute("geometry");
    if (geometry) {
      if (typeof geometry.width === "number" && geometry.width > 0) {
        widthUnits = geometry.width;
      }
      if (typeof geometry.height === "number" && geometry.height > 0) {
        heightUnits = geometry.height;
      }
    }

    widthUnits = Math.max(0.01, widthUnits);
    heightUnits = Math.max(0.01, heightUnits);

    const pxPerUnit = 700;
    const nextWidth = Math.min(4096, Math.max(256, Math.round(widthUnits * pxPerUnit)));
    const nextHeight = Math.min(2048, Math.max(128, Math.round(heightUnits * pxPerUnit)));
    const nextSize = `${nextWidth}x${nextHeight}`;

    if (this.lastCanvasSize === nextSize) {
      return;
    }

    this.canvas.width = nextWidth;
    this.canvas.height = nextHeight;
    this.lastCanvasSize = nextSize;
    this.texture.needsUpdate = true;
  },

  wrapLines: function (text, maxWidth) {
    const paragraphs = String(text).split("\n");
    const lines = [];

    for (const paragraph of paragraphs) {
      const words = paragraph.split(" ");
      let currentLine = "";

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = this.ctx.measureText(testLine).width;

        if (testWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      lines.push(currentLine || "");
    }

    return lines;
  },

  draw: function () {
    this.resizeCanvasToElement();

    const { value, color, align, fontSize, padding, fontFamily, lineHeight } = this.data;
    const ctx = this.ctx;
    const canvas = this.canvas;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.font = `${fontSize}px ${fontFamily}`;

    const maxWidth = canvas.width - padding * 2;
    const lines = this.wrapLines(value, maxWidth);
    const linePx = fontSize * lineHeight;
    const totalHeight = lines.length * linePx;
    let y = (canvas.height - totalHeight) / 2 + linePx / 2;

    for (const line of lines) {
      let x = padding;
      ctx.textAlign = "left";

      if (align === "center") {
        x = canvas.width / 2;
        ctx.textAlign = "center";
      } else if (align === "right") {
        x = canvas.width - padding;
        ctx.textAlign = "right";
      }

      ctx.fillText(line, x, y);
      y += linePx;
    }

    this.texture.needsUpdate = true;
  }
});

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

  if (action === game.expectedAction) {
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
  repositionWorldHud();

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
  repositionWorldHud();

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
  repositionWorldHud();

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

  resetEnemyPosition();

  setPrompt("APERTE INICIAR");
  setPromptState(false);
  setResult("Aguardando...");
  beginPhaseTracking();
  renderPerformanceHistory();
  updateHUD();
}

function dispatchAction(action, source = "unknown") {
  receiveAction(action, source);
}

window.dispatchGameAction = dispatchAction;

document.addEventListener(
  "keydown",
  (event) => {
    const blockedKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (blockedKeys.includes(event.key)) {
      event.preventDefault();
    }

    if (!game.running) return;

    if (event.key === "ArrowUp") dispatchAction("attack", "teclado");
    if (event.key === "ArrowLeft") dispatchAction("dodgeLeft", "teclado");
    if (event.key === "ArrowRight") dispatchAction("dodgeRight", "teclado");
    if (event.key === "ArrowDown") dispatchAction("duck", "teclado");
  },
  { passive: false }
);

AFRAME.registerComponent("gaze-button", {
  schema: {
    action: { type: "string" },
    dwellTime: { type: "number", default: 1200 }
  },

  init: function () {
    this.defaultScale = this.el.object3D.scale.clone();
    this.hoverTimeout = null;
    this.hasActivated = false;

    this.clearHoverTimer = () => {
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
        this.hoverTimeout = null;
      }
    };

    this.runAction = () => {
      if (this.data.action === "start") {
        startGame();
      } else if (this.data.action === "calibrate") {
        const cam = document.getElementById("playerCamera");
        if (cam && cam.components["head-input"]) {
          cam.components["head-input"].calibrate();
          repositionWorldHud();
          setResult("Cabeça calibrada.", "success");
        }
      } else if (this.data.action === "reset") {
        resetGame();
      }
    };

    this.activate = () => {
      if (this.hasActivated) return;
      this.hasActivated = true;
      this.el.object3D.scale.copy(this.defaultScale);
      this.runAction();
    };

    this.el.addEventListener("mouseenter", () => {
      this.hasActivated = false;
      this.el.object3D.scale.set(
        this.defaultScale.x * 1.06,
        this.defaultScale.y * 1.06,
        this.defaultScale.z * 1.06
      );

      this.clearHoverTimer();
      this.hoverTimeout = setTimeout(() => {
        this.activate();
      }, this.data.dwellTime);
    });

    this.el.addEventListener("mouseleave", () => {
      this.clearHoverTimer();
      this.hasActivated = false;
      this.el.object3D.scale.copy(this.defaultScale);
    });

    this.el.addEventListener("click", () => {
      if (this.hasActivated) return;
      this.clearHoverTimer();
      this.activate();
    });
  },

  remove: function () {
    this.clearHoverTimer();
  }
});

AFRAME.registerComponent("arena-circle", {
  init: function () {
    const radius = 12;
    const count = 48;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      const wall = document.createElement("a-box");
      wall.setAttribute("position", `${x} 1 ${z}`);
      wall.setAttribute("rotation", `0 ${(-angle * 180 / Math.PI) + 90} 0`);
      wall.setAttribute("width", "2");
      wall.setAttribute("height", "2");
      wall.setAttribute("depth", "0.3");
      wall.setAttribute("color", "#8B4513");

      this.el.appendChild(wall);
    }
  }
});

AFRAME.registerComponent("head-input", {
  schema: {
    dodgeThreshold: { default: 0.16 },
    duckThreshold: { default: 0.13 },
    attackThreshold: { default: 0.16 },
    cooldownMs: { default: 600 }
  },

  init: function () {
    this.rest = new THREE.Vector3();
    this.current = new THREE.Vector3();
    this.calibrated = false;
    this.lastActionTime = 0;
  },

  calibrate: function () {
    this.el.object3D.getWorldPosition(this.rest);
    this.calibrated = true;
    this.lastActionTime = performance.now();
  },

  tick: function () {
    if (!game.running) return;
    if (!game.waitingInput) return;
    if (!this.calibrated) return;

    this.el.object3D.getWorldPosition(this.current);

    const dx = this.current.x - this.rest.x;
    const dy = this.current.y - this.rest.y;
    const dz = this.rest.z - this.current.z;

    const now = performance.now();
    if (now - this.lastActionTime < this.data.cooldownMs) return;

    if (dx <= -this.data.dodgeThreshold) {
      window.dispatchGameAction("dodgeLeft", "cabeça");
      this.lastActionTime = now;
    } else if (dx >= this.data.dodgeThreshold) {
      window.dispatchGameAction("dodgeRight", "cabeça");
      this.lastActionTime = now;
    } else if (dy <= -this.data.duckThreshold) {
      window.dispatchGameAction("duck", "cabeça");
      this.lastActionTime = now;
    } else if (dz >= this.data.attackThreshold) {
      window.dispatchGameAction("attack", "cabeça");
      this.lastActionTime = now;
    }
  }
});

AFRAME.registerComponent("enemy-ai", {
  schema: {
    speed: { default: 0.02 },
    attackDistance: { default: 1.8 }
  },

  init: function () {
    this.canAttack = true;
  },

  resumeCombat: function () {
    this.canAttack = true;
  },

  tick: function () {
    if (!game.running) return;
    if (game.waitingInput) return;
    if (!this.canAttack) return;

    const playerCam = document.getElementById("playerCamera");
    if (!playerCam) return;

    const playerPos = new THREE.Vector3();
    playerCam.object3D.getWorldPosition(playerPos);

    const enemyPos = this.el.object3D.position.clone();
    playerPos.y = enemyPos.y;

    const distance = enemyPos.distanceTo(playerPos);

    if (distance > this.data.attackDistance) {
      const direction = new THREE.Vector3();
      direction.subVectors(playerPos, enemyPos).normalize();
      this.el.object3D.position.add(direction.multiplyScalar(this.data.speed));
      this.el.object3D.lookAt(playerPos);
    } else {
      this.attack();
    }
  },

  attack: function () {
    this.canAttack = false;

    const phase = game.phase;
    let pattern;

    if (phase === 1) {
      pattern = Math.random() < 0.33
        ? "vulnerable"
        : (Math.random() < 0.5 ? "left" : "right");
    } else if (phase === 2) {
      const choices = ["left", "right", "high", "vulnerable"];
      pattern = choices[Math.floor(Math.random() * choices.length)];
    } else {
      const roll = Math.random();
      if (roll < 0.28) pattern = "left";
      else if (roll < 0.56) pattern = "right";
      else if (roll < 0.82) pattern = "high";
      else pattern = "vulnerable";
    }

    if (pattern === "left" || pattern === "right") {
      this.swingArm(pattern);
    } else if (pattern === "high") {
      this.highAttack();
    } else if (pattern === "vulnerable") {
      this.vulnerableOpen();
    }
  },

  swingArm: function (side) {
    const arm = this.el.querySelector(side === "left" ? "#leftArm" : "#rightArm");
    if (!arm) return;

    const windup = side === "left" ? -15 : 15;
    const hit = side === "left" ? 120 : -120;

    arm.setAttribute("animation__windup", {
      property: "rotation",
      to: `0 0 ${windup}`,
      dur: 180
    });

    setTimeout(() => {
      arm.setAttribute("animation__attack", {
        property: "rotation",
        to: `0 0 ${hit}`,
        dur: 140,
        dir: "alternate",
        loop: 2
      });

      const expected = side === "left" ? "dodgeRight" : "dodgeLeft";
      openPrompt(expected);
    }, 180);
  },

  highAttack: function () {
    const head = this.el.querySelector("#enemyHead");
    if (!head) return;

    head.setAttribute("animation__headattack", {
      property: "position",
      to: "0 2.0 0.4",
      dur: 180,
      dir: "alternate",
      loop: 2
    });

    setTimeout(() => {
      openPrompt("duck");
    }, 180);
  },

  vulnerableOpen: function () {
    const head = this.el.querySelector("#enemyHead");
    if (!head) return;

    head.setAttribute("animation__vulnerable", {
      property: "rotation",
      to: "25 0 0",
      dur: 220,
      dir: "alternate",
      loop: 2
    });

    setTimeout(() => {
      openPrompt("attack");
    }, 150);
  }
});

window.addEventListener("load", () => {
  setTimeout(() => {
    repositionWorldHud();
    setPromptState(false);
    renderPerformanceHistory();
    updateHUD();
  }, 300);
});

updateHUD();
