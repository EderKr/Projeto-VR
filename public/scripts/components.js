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
        if (typeof setSelectedDifficulty === 'function') setSelectedDifficulty(1);
      } else if (this.data.action === "custom_set_difficulty_2") {
        if (typeof setSelectedDifficulty === 'function') setSelectedDifficulty(2);
      } else if (this.data.action === "custom_set_difficulty_3") {
        if (typeof setSelectedDifficulty === 'function') setSelectedDifficulty(3);
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

  tick: function (time, timeDelta) {
    if (this.modelMixer) {
      this.modelMixer.update((timeDelta || 0) / 1000);
    }

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
    this.isDefeated = false;
    this.currentModelClip = null;
    this.modelEls = {
      king: this.el.querySelector("#enemyModelKing"),
      adventurer: this.el.querySelector("#enemyModelAdventurer"),
      witch: this.el.querySelector("#enemyModelWitch")
    };
    this.modelEl = this.modelEls.king;
    this.swordSlashFx = this.el.querySelector("#swordSlashFx");
    this.magicFx = this.el.querySelector("#magicFx");
    this.swordSlashFxTimeout = null;
    this.swordSlashFxRaf = null;
    this.magicFxTimeout = null;
    this.magicFxRaf = null;
    this.modelMixers = new Map();
    this.modelActionsByEl = new WeakMap();
    this.currentAction = null;
    this.pendingIdleTimeout = null;
    this.currentPhaseModel = 1;

    this.getActiveProfile = () => {
      return typeof getEnemyProfile === "function" ? getEnemyProfile(this.currentPhaseModel || getActiveDifficultyPhase()) : null;
    };

    this.getActiveModelEl = () => this.modelEl || this.modelEls.king;
    this.el.getActiveModelEl = this.getActiveModelEl;

    this.stopVisualFx = () => {
      if (this.swordSlashFxTimeout) clearTimeout(this.swordSlashFxTimeout);
      if (this.swordSlashFxRaf) cancelAnimationFrame(this.swordSlashFxRaf);
      if (this.magicFxTimeout) clearTimeout(this.magicFxTimeout);
      if (this.magicFxRaf) cancelAnimationFrame(this.magicFxRaf);
      this.swordSlashFxTimeout = null;
      this.swordSlashFxRaf = null;
      this.magicFxTimeout = null;
      this.magicFxRaf = null;
      if (this.swordSlashFx) this.swordSlashFx.setAttribute("visible", "false");
      if (this.magicFx) this.magicFx.setAttribute("visible", "false");
    };

    this.resetActionState = () => {
      if (this.currentAction) {
        this.currentAction.stop();
      }
      this.currentAction = null;
      this.currentModelClip = null;
      if (this.pendingIdleTimeout) {
        clearTimeout(this.pendingIdleTimeout);
        this.pendingIdleTimeout = null;
      }
    };

    this.prepareModelAnimations = (modelEl, modelRoot) => {
      if (!modelEl || !modelRoot) return;
      const clips = modelRoot.animations || [];
      if (!clips.length) return;

      const previousMixer = this.modelMixers.get(modelEl);
      if (previousMixer) previousMixer.stopAllAction();

      const mixer = new THREE.AnimationMixer(modelRoot);
      const actions = new Map();
      clips.forEach((clip) => {
        actions.set(clip.name, {
          clip,
          action: mixer.clipAction(clip)
        });
      });

      this.modelMixers.set(modelEl, mixer);
      this.modelActionsByEl.set(modelEl, actions);

      if (modelEl === this.getActiveModelEl()) {
        this.resetActionState();
        this.playIdle();
      }
    };

    Object.values(this.modelEls).forEach((modelEl) => {
      if (!modelEl) return;
      modelEl.addEventListener("model-loaded", (event) => {
        this.prepareModelAnimations(modelEl, event.detail.model || modelEl.getObject3D("mesh"));
      });

      const existingModel = modelEl.getObject3D("mesh");
      if (existingModel) {
        this.prepareModelAnimations(modelEl, existingModel);
      }
    });

    this.applyVariantForPhase = (phase) => {
      const resolvedPhase = Math.min(3, Math.max(1, Number.parseInt(phase, 10) || 1));
      const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(resolvedPhase) : null;
      const key = profile && profile.key ? profile.key : "king";
      const scale = profile && profile.scale ? profile.scale : "1.12 1.12 1.12";
      const distance = profile && profile.attackDistance ? profile.attackDistance : 1.9;
      const speed = profile && profile.speed ? profile.speed : this.data.speed;
      const activeModel = this.modelEls[key] || this.modelEls.king;
      if (!activeModel) return;

      this.stopVisualFx();
      this.resetActionState();
      this.currentPhaseModel = resolvedPhase;
      this.data.attackDistance = distance;
      this.data.speed = speed;
      this.isDefeated = false;
      this.canAttack = true;

      this.el.object3D.visible = true;
      this.el.setAttribute("visible", "true");
      this.el.object3D.rotation.set(0, 0, 0);

      Object.entries(this.modelEls).forEach(([modelKey, modelEl]) => {
        if (!modelEl) return;
        const isActive = modelKey === key;
        modelEl.setAttribute("visible", isActive ? "true" : "false");
        modelEl.object3D.visible = isActive;
        modelEl.object3D.position.set(0, 0, 0);
        modelEl.object3D.rotation.set(0, 0, 0);
        if (isActive) modelEl.setAttribute("scale", scale);
      });

      this.modelEl = activeModel;
      this.playIdle();
    };

    this.playModelClip = (clip, loop = "once", clampWhenFinished = true, options = {}) => {
      const model = this.getActiveModelEl();
      if (!model || !clip) return false;
      if (this.currentModelClip === clip && loop === "repeat" && this.currentAction) return true;

      if (this.pendingIdleTimeout) {
        clearTimeout(this.pendingIdleTimeout);
        this.pendingIdleTimeout = null;
      }

      const mixer = this.modelMixers.get(model);
      const actions = this.modelActionsByEl.get(model);

      if (mixer && actions && actions.has(clip)) {
        const entry = actions.get(clip);
        const action = entry.action;
        const shouldReverse = Boolean(options.reverse);

        if (this.currentAction && this.currentAction !== action) {
          this.currentAction.fadeOut(0.08);
        }

        action.reset();
        action.enabled = true;
        action.clampWhenFinished = clampWhenFinished;
        action.setLoop(loop === "repeat" ? THREE.LoopRepeat : THREE.LoopOnce, loop === "repeat" ? Infinity : 1);
        action.timeScale = shouldReverse ? -1 : 1;
        action.time = shouldReverse ? entry.clip.duration : 0;
        action.fadeIn(this.currentAction && this.currentAction !== action ? 0.08 : 0);
        action.play();

        this.currentAction = action;
        this.currentModelClip = clip;
        return true;
      }

      return false;
    };

    this.playIdle = () => {
      const profile = this.getActiveProfile();
      const idleClip = profile && profile.idleClip ? profile.idleClip : "CharacterArmature|Idle";
      this.playModelClip(idleClip, "repeat", false);
    };

    this.scheduleIdleReturn = (delay = 850) => {
      if (this.pendingIdleTimeout) clearTimeout(this.pendingIdleTimeout);
      this.pendingIdleTimeout = setTimeout(() => {
        this.pendingIdleTimeout = null;
        if (!this.isDefeated && game.running) this.playIdle();
      }, delay);
    };

    this.applyVariantForPhase(getActiveDifficultyPhase());
  },

  getActiveModelEl: function () {
    return this.modelEl || (this.modelEls && (this.modelEls.king || this.modelEls.adventurer || this.modelEls.witch));
  },

  setVariantForPhase: function (phase) {
    if (typeof this.applyVariantForPhase === "function") {
      this.applyVariantForPhase(phase);
    }
  },

  resumeCombat: function () {
    if (typeof this.applyVariantForPhase === "function") {
      this.applyVariantForPhase(getActiveDifficultyPhase());
    }
    this.isDefeated = false;
    this.canAttack = true;
    this.el.object3D.visible = true;
    this.el.setAttribute("visible", "true");
    const model = this.getActiveModelEl();
    if (model) {
      model.object3D.visible = true;
      model.setAttribute("visible", "true");
      model.object3D.position.set(0, 0, 0);
      model.object3D.rotation.set(0, 0, 0);
    }
    this.playIdle();
  },

  defeat: function (onFinished) {
    this.isDefeated = true;
    this.canAttack = false;
    if (typeof this.stopVisualFx === "function") this.stopVisualFx();
    const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(this.currentPhaseModel || getActiveDifficultyPhase()) : null;
    const deathClip = profile && profile.deathClip ? profile.deathClip : "CharacterArmature|Death";
    this.playModelClip(deathClip, "once", true);

    if (typeof onFinished === "function") {
      setTimeout(onFinished, 1450);
    }
  },

  tick: function (time, timeDelta) {
    for (const mixer of this.modelMixers.values()) {
      mixer.update((timeDelta || 0) / 1000);
    }

    if (!game.running) return;
    if (game.waitingInput) return;
    if (this.isDefeated) return;
    if (!this.canAttack) return;

    const playerCam = document.getElementById("playerCamera");
    if (!playerCam) return;

    const playerPos = new THREE.Vector3();
    playerCam.object3D.getWorldPosition(playerPos);

    const enemyPos = this.el.object3D.position.clone();
    playerPos.y = enemyPos.y;

    const distance = enemyPos.distanceTo(playerPos);
    const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(this.currentPhaseModel || getActiveDifficultyPhase()) : null;
    const attackDistance = profile && profile.attackDistance ? profile.attackDistance : this.data.attackDistance;
    const keepDistance = profile && profile.keepDistance ? profile.keepDistance : 0;

    if (distance > attackDistance) {
      const runClip = profile && profile.runClip ? profile.runClip : "CharacterArmature|Run";
      this.playModelClip(runClip, "repeat", false);
      const direction = new THREE.Vector3();
      direction.subVectors(playerPos, enemyPos).normalize();
      this.el.object3D.position.add(direction.multiplyScalar(this.data.speed));
      this.el.object3D.lookAt(playerPos);
      const model = this.getActiveModelEl();
      if (model) {
        model.object3D.visible = true;
        model.object3D.position.set(0, 0, 0);
      }
      return;
    }

    if (keepDistance > 0 && distance < keepDistance) {
      const direction = new THREE.Vector3();
      direction.subVectors(enemyPos, playerPos).normalize();
      this.el.object3D.position.add(direction.multiplyScalar(this.data.speed * 0.65));
      this.el.object3D.lookAt(playerPos);
      this.playIdle();
      return;
    }

    this.el.object3D.lookAt(playerPos);
    this.attack();
  },

  choosePattern: function (weights) {
    let roll = Math.random();
    let pattern = "vulnerable";
    for (const [candidate, weight] of Object.entries(weights)) {
      roll -= weight;
      if (roll <= 0) {
        pattern = candidate;
        break;
      }
    }
    return pattern;
  },

  attack: function () {
    this.canAttack = false;
    const phase = game.phase;
    const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(getActiveDifficultyPhase()) : null;
    const weights = profile && profile.patternWeights
      ? profile.patternWeights
      : { vulnerable: 0.25, left: 0.25, right: 0.25, high: 0.25 };

    const pattern = this.choosePattern(weights);
    const style = profile && profile.attackStyle ? profile.attackStyle : "brawler";

    if (pattern === "vulnerable") {
      this.vulnerableOpen();
    } else if (style === "magic") {
      this.magicAttack(pattern);
    } else {
      this.physicalAttack(pattern);
    }
  },

  playSwordSlashFx: function () {
    const fx = this.swordSlashFx || this.el.querySelector("#swordSlashFx");
    if (!fx) return;

    if (this.swordSlashFxTimeout) clearTimeout(this.swordSlashFxTimeout);
    if (this.swordSlashFxRaf) cancelAnimationFrame(this.swordSlashFxRaf);

    const setFxOpacity = (opacity) => {
      fx.object3D.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          material.transparent = true;
          material.opacity = opacity;
          material.needsUpdate = true;
        });
      });
    };

    const startPos = new THREE.Vector3(0.55, 2.25, 0.72);
    const endPos = new THREE.Vector3(-0.42, 1.55, 0.72);
    const duration = 300;
    const startedAt = performance.now();

    fx.setAttribute("visible", "true");
    fx.object3D.position.copy(startPos);
    fx.object3D.rotation.set(0, 0, THREE.MathUtils.degToRad(35));
    fx.object3D.scale.set(0.15, 0.15, 0.15);
    setFxOpacity(0.92);

    const animate = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const scale = 0.15 + (1.14 - 0.15) * easeOut;
      const opacity = Math.max(0, 0.92 * (1 - Math.pow(t, 1.35)));

      fx.object3D.position.lerpVectors(startPos, endPos, easeOut);
      fx.object3D.scale.set(scale, scale, scale);
      setFxOpacity(opacity);

      if (t < 1) {
        this.swordSlashFxRaf = requestAnimationFrame(animate);
        return;
      }

      fx.setAttribute("visible", "false");
      fx.object3D.position.copy(startPos);
      fx.object3D.scale.set(0.15, 0.15, 0.15);
      setFxOpacity(0.88);
      this.swordSlashFxRaf = null;
    };

    this.swordSlashFxRaf = requestAnimationFrame(animate);
    this.swordSlashFxTimeout = setTimeout(() => {
      fx.setAttribute("visible", "false");
      setFxOpacity(0.88);
      this.swordSlashFxTimeout = null;
    }, 440);
  },

  playMagicFx: function (pattern) {
    const fx = this.magicFx || this.el.querySelector("#magicFx");
    if (!fx) return;

    if (this.magicFxTimeout) clearTimeout(this.magicFxTimeout);
    if (this.magicFxRaf) cancelAnimationFrame(this.magicFxRaf);

    const setFxOpacity = (opacity) => {
      fx.object3D.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => {
          material.transparent = true;
          material.opacity = opacity;
          material.needsUpdate = true;
        });
      });
    };

    const startMap = {
      // A magia nasce claramente no lado do ataque para permitir leitura antecipada:
      // energia à esquerda do jogador => desvie para a direita; energia à direita => desvie para a esquerda.
      left: new THREE.Vector3(-0.95, 1.82, 0.72),
      right: new THREE.Vector3(0.95, 1.82, 0.72),
      high: new THREE.Vector3(0, 2.55, 0.72)
    };
    const endMap = {
      left: new THREE.Vector3(-0.34, 1.48, 2.12),
      right: new THREE.Vector3(0.34, 1.48, 2.12),
      high: new THREE.Vector3(0, 1.02, 2.12)
    };

    const startPos = startMap[pattern] || startMap.high;
    const endPos = endMap[pattern] || endMap.high;
    const startedAt = performance.now();
    const duration = 460;

    fx.setAttribute("visible", "true");
    fx.object3D.position.copy(startPos);
    fx.object3D.scale.set(0.18, 0.18, 0.18);
    setFxOpacity(0.9);

    const animate = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      const pulse = 1 + Math.sin(t * Math.PI * 4) * 0.12;
      fx.object3D.position.lerpVectors(startPos, endPos, ease);
      fx.object3D.scale.setScalar((0.18 + 0.62 * ease) * pulse);
      fx.object3D.rotation.y += 0.18;
      setFxOpacity(Math.max(0, 0.9 * (1 - t * 0.86)));

      if (t < 1) {
        this.magicFxRaf = requestAnimationFrame(animate);
      } else {
        fx.setAttribute("visible", "false");
        fx.object3D.scale.set(0.2, 0.2, 0.2);
        setFxOpacity(0.86);
        this.magicFxRaf = null;
      }
    };

    this.magicFxRaf = requestAnimationFrame(animate);
    this.magicFxTimeout = setTimeout(() => {
      fx.setAttribute("visible", "false");
      setFxOpacity(0.86);
      this.magicFxTimeout = null;
    }, duration + 120);
  },

  getAttackDelay: function (pattern, fallback) {
    const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(getActiveDifficultyPhase()) : null;
    return profile && profile.attackDelay && profile.attackDelay[pattern] ? profile.attackDelay[pattern] : fallback;
  },

  getResponseActionForPattern: function (pattern) {
    if (pattern === "left") return "dodgeRight";
    if (pattern === "right") return "dodgeLeft";
    return "duck";
  },

  openDefenseWindow: function (pattern, sourceType = "attack") {
    const expected = this.getResponseActionForPattern(pattern);
    if (typeof openPrompt === "function") {
      openPrompt(expected, {
        label: sourceType === "magic" ? "MAGIA" : "DEFENDA-SE",
        resultText: sourceType === "magic" ? "Leia a origem da magia." : "Leia o movimento do inimigo."
      });
    }
  },

  physicalAttack: function (pattern) {
    const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(getActiveDifficultyPhase()) : null;
    const clips = profile && profile.attacks ? profile.attacks : {};
    const clip = clips[pattern] || "CharacterArmature|Punch_Right";
    const options = clips[`${pattern}Options`] || {};
    const usesSwordFx = Boolean(options.swordFx);

    // A janela abre junto com o início do golpe. Assim o jogador pode desviar antecipadamente,
    // sem esperar uma instrução específica aparecer depois da animação.
    this.openDefenseWindow(pattern, "attack");

    if (this.playModelClip(clip, "once", true, options)) {
      if (usesSwordFx) this.playSwordSlashFx();
      this.scheduleIdleReturn(860);
      return;
    }

    this.scheduleIdleReturn(760);
  },

  magicAttack: function (pattern) {
    const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(getActiveDifficultyPhase()) : null;
    const clips = profile && profile.attacks ? profile.attacks : {};
    const clip = clips[pattern] || "CharacterArmature|Gun_Shoot";

    // A Bruxa também abre a janela no começo do telegraph. O efeito visual indica o lado,
    // mas a UI não entrega qual ação fazer.
    this.openDefenseWindow(pattern, "magic");
    this.playModelClip(clip, "once", true);
    this.playMagicFx(pattern);
    this.scheduleIdleReturn(780);
  },

  vulnerableOpen: function () {
    const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(getActiveDifficultyPhase()) : null;
    const clip = profile && profile.vulnerableClip ? profile.vulnerableClip : "CharacterArmature|HitRecieve";

    if (typeof openPrompt === "function") {
      openPrompt("attack", { label: "ABERTURA", resultText: "Acerte enquanto o inimigo está exposto." });
    }

    if (this.playModelClip(clip, "once", true)) {
      this.scheduleIdleReturn(850);
      return;
    }

    this.scheduleIdleReturn(720);
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