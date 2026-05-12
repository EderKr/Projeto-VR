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

AFRAME.registerComponent("gaze-button", {
  schema: {
    action: { type: "string" },
    dwellTime: { type: "number", default: 1200 },
    alwaysActive: { type: "boolean", default: false }
  },

  init: function () {
    this.defaultScale = this.el.object3D.scale.clone();
    this.hoverTimeout = null;
    this.hasActivated = false;
    this.raycaster = new THREE.Raycaster();
    this.direction = new THREE.Vector3();

    this.isVisibleInHierarchy = () => {
      let current = this.el;
      while (current) {
        if (current.getAttribute) {
          const visibleAttr = current.getAttribute('visible');
          if (visibleAttr === false || visibleAttr === 'false') {
            return false;
          }
        }
        current = current.parentEl;
      }
      return true;
    };

    this.isLookingAt = () => {
      if (!this.data.alwaysActive) return false;

      const camera = document.getElementById('playerCamera');
      if (!camera) return false;

      const cameraPos = new THREE.Vector3();
      const cameraDir = new THREE.Vector3(0, 0, -1);
      camera.object3D.getWorldPosition(cameraPos);
      camera.object3D.getWorldDirection(cameraDir);

      const buttonPos = new THREE.Vector3();
      this.el.object3D.getWorldPosition(buttonPos);

      const toButton = buttonPos.clone().sub(cameraPos).normalize();
      const dot = cameraDir.dot(toButton);
      const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;

      return angle < 15;
    };

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
          setResult("Cabeça calibrada.", "success");
        }
      } else if (this.data.action === "reset") {
        resetGame();

      /* VR UI actions */
      } else {
        const vrMenuActions = new Set([
          "openCustomizeMenu",
          "openHistoryMenu",
          "backToMainMenu",
          "resumeGame",
          "toggle_custom_mode",
          "selectHistoryTab",
          "selectAITab",
          "custom_lives_inc",
          "custom_lives_dec",
          "custom_toggle_lives_infinite",
          "custom_enemy_inc",
          "custom_enemy_dec",
          "custom_toggle_enemy_infinite",
          "custom_set_difficulty_1",
          "custom_set_difficulty_2",
          "custom_set_difficulty_3"
        ]);

        if (vrMenuActions.has(this.data.action)) {
          if (typeof vrMenuState === 'undefined' || !vrMenuState.isOpen) {
            return;
          }
        }
      }

      if (this.data.action === "togglePauseMenu") {
        if (typeof toggleVRPauseMenu === "function") toggleVRPauseMenu();
      } else if (this.data.action === "openVRPauseMenu") {
        if (typeof openVRPauseMenu === "function") openVRPauseMenu();
      } else if (this.data.action === "openCustomizeMenu") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof openCustomizeMenu === "function") openCustomizeMenu();
      } else if (this.data.action === "openHistoryMenu") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof openHistoryMenu === "function") openHistoryMenu();
      } else if (this.data.action === "backToMainMenu") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof backToMainMenu === "function") backToMainMenu();
      } else if (this.data.action === "resumeGame") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof resumeGame === "function") resumeGame();
      } else if (this.data.action === "toggle_custom_mode") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof toggleCustomMode === "function") toggleCustomMode();
      } else if (this.data.action === "selectHistoryTab") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof selectHistoryTab === "function") selectHistoryTab();
      } else if (this.data.action === "selectAITab") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof selectAITab === "function") selectAITab();
      } else if (this.data.action === "custom_lives_inc") {
        if (typeof customLivesEl !== 'undefined' && customLivesEl) {
          customLivesEl.value = Math.max(1, (parseInt(customLivesEl.value, 10) || 3) + 1);
        }
        if (typeof updateCustomizeMenuDisplay === 'function') updateCustomizeMenuDisplay();
      } else if (this.data.action === "custom_lives_dec") {
        if (typeof customLivesEl !== 'undefined' && customLivesEl) {
          customLivesEl.value = Math.max(1, (parseInt(customLivesEl.value, 10) || 3) - 1);
        }
        if (typeof updateCustomizeMenuDisplay === 'function') updateCustomizeMenuDisplay();
      } else if (this.data.action === "custom_toggle_lives_infinite") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof customLivesInfiniteEl !== 'undefined' && customLivesInfiniteEl) {
          customLivesInfiniteEl.checked = !customLivesInfiniteEl.checked;
        }
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof updateCustomizeMenuDisplay === 'function') updateCustomizeMenuDisplay();
      } else if (this.data.action === "custom_enemy_inc") {
        if (typeof customEnemyHitsEl !== 'undefined' && customEnemyHitsEl) {
          customEnemyHitsEl.value = Math.max(1, (parseInt(customEnemyHitsEl.value, 10) || 3) + 1);
        }
        if (typeof updateCustomizeMenuDisplay === 'function') updateCustomizeMenuDisplay();
      } else if (this.data.action === "custom_toggle_enemy_infinite") {
        if (typeof vrMenuState !== 'undefined' && vrMenuState.isOpen && typeof toggleCustomEnemyInfinite === 'function') toggleCustomEnemyInfinite();
      } else if (this.data.action === "custom_enemy_dec") {
        if (typeof customEnemyHitsEl !== 'undefined' && customEnemyHitsEl) {
          customEnemyHitsEl.value = Math.max(1, (parseInt(customEnemyHitsEl.value, 10) || 3) - 1);
        }
        if (typeof updateCustomizeMenuDisplay === 'function') updateCustomizeMenuDisplay();
      } else if (this.data.action === "custom_set_difficulty_1") {
        if (typeof customDifficultyEl !== 'undefined' && customDifficultyEl) customDifficultyEl.value = "1";
        if (typeof updateCustomizeMenuDisplay === 'function') updateCustomizeMenuDisplay();
      } else if (this.data.action === "custom_set_difficulty_2") {
        if (typeof customDifficultyEl !== 'undefined' && customDifficultyEl) customDifficultyEl.value = "2";
        if (typeof updateCustomizeMenuDisplay === 'function') updateCustomizeMenuDisplay();
      } else if (this.data.action === "custom_set_difficulty_3") {
        if (typeof customDifficultyEl !== 'undefined' && customDifficultyEl) customDifficultyEl.value = "3";
        if (typeof updateCustomizeMenuDisplay === 'function') updateCustomizeMenuDisplay();
      }
    };

    this.activate = () => {
      if (this.hasActivated) return;
      if (!this.isVisibleInHierarchy()) return;
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
    rollThreshold: { default: 0.26 },
    pitchDuckThreshold: { default: 0.2 },
    pitchAttackThreshold: { default: 0.22 },
    cooldownMs: { default: 600 }
  },

  init: function () {
    this.rest = new THREE.Vector3();
    this.current = new THREE.Vector3();
    this.restQuat = new THREE.Quaternion();
    this.restQuatInv = new THREE.Quaternion();
    this.currentQuat = new THREE.Quaternion();
    this.deltaQuat = new THREE.Quaternion();
    this.deltaEuler = new THREE.Euler(0, 0, 0, "YXZ");
    this.calibrated = false;
    this.lastActionTime = 0;
  },

  calibrate: function () {
    this.el.object3D.getWorldPosition(this.rest);
    this.el.object3D.getWorldQuaternion(this.restQuat);
    this.restQuatInv.copy(this.restQuat).invert();
    this.calibrated = true;
    this.lastActionTime = performance.now();
  },

  tick: function () {
    if (!game.running) return;
    if (!game.waitingInput) return;
    if (!this.calibrated) return;

    this.el.object3D.getWorldPosition(this.current);
    this.el.object3D.getWorldQuaternion(this.currentQuat);

    const dx = this.current.x - this.rest.x;
    const dy = this.current.y - this.rest.y;
    const dz = this.rest.z - this.current.z;

    this.deltaQuat.copy(this.restQuatInv).multiply(this.currentQuat);
    this.deltaEuler.setFromQuaternion(this.deltaQuat, "YXZ");

    const pitch = this.deltaEuler.x;
    const roll = this.deltaEuler.z;

    const now = performance.now();
    if (now - this.lastActionTime < this.data.cooldownMs) return;

    if (roll <= -this.data.rollThreshold || dx <= -this.data.dodgeThreshold) {
      window.dispatchGameAction("dodgeRight", "cabeça");
      this.lastActionTime = now;
    } else if (roll >= this.data.rollThreshold || dx >= this.data.dodgeThreshold) {
      window.dispatchGameAction("dodgeLeft", "cabeça");
      this.lastActionTime = now;
    } else if (pitch >= this.data.pitchDuckThreshold || dy <= -this.data.duckThreshold) {
      window.dispatchGameAction("duck", "cabeça");
      this.lastActionTime = now;
    } else if (pitch <= -this.data.pitchAttackThreshold || dz >= this.data.attackThreshold) {
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

    this.replayAnimation = (target, animationName, config) => {
      if (!target) return;

      target.removeAttribute(animationName);
      requestAnimationFrame(() => {
        target.setAttribute(animationName, config);
      });
    };
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

    this.replayAnimation(arm, "animation__windup", {
      property: "rotation",
      to: `0 0 ${windup}`,
      dur: 180
    });

    setTimeout(() => {
      this.replayAnimation(arm, "animation__attack", {
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

    this.replayAnimation(head, "animation__headattack", {
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

    this.replayAnimation(head, "animation__vulnerable", {
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
    setPromptState(false);
    renderPerformanceHistory();
    updateHUD();
    setRoundControlsVisibility(game.running);
    if (typeof updateVRCustomPanel === 'function') updateVRCustomPanel();
    if (typeof updateVRHistory === 'function') updateVRHistory();
  }, 300);
});

updateHUD();