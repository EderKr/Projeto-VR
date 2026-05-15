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

AFRAME.registerComponent("always-on-top", {
  schema: {
    order: { type: "number", default: 10000 }
  },

  init: function () {
    this.apply = this.apply.bind(this);
    this.el.addEventListener("object3dset", this.apply);
    this.el.addEventListener("loaded", this.apply);
    this.apply();
  },

  play: function () {
    this.apply();
  },

  update: function () {
    this.apply();
  },

  apply: function () {
    const order = this.data.order;
    this.el.object3D.renderOrder = order;
    this.el.object3D.traverse((node) => {
      node.renderOrder = order;
      if (!node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        material.depthTest = false;
        material.depthWrite = false;
        material.transparent = true;
        material.opacity = 1;
        material.needsUpdate = true;
      });
    });
  },

  remove: function () {
    this.el.removeEventListener("object3dset", this.apply);
    this.el.removeEventListener("loaded", this.apply);
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
          "custom_set_difficulty_3",
          "sfx_volume_0",
          "sfx_volume_25",
          "sfx_volume_50",
          "sfx_volume_100"
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
      } else if (this.data.action === "sfx_volume_0") {
        if (typeof setSfxVolume === 'function') setSfxVolume(0);
      } else if (this.data.action === "sfx_volume_25") {
        if (typeof setSfxVolume === 'function') setSfxVolume(0.25);
      } else if (this.data.action === "sfx_volume_50") {
        if (typeof setSfxVolume === 'function') setSfxVolume(0.5);
      } else if (this.data.action === "sfx_volume_100") {
        if (typeof setSfxVolume === 'function') setSfxVolume(1);
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

    // Sem piso externo: o chão visível fica restrito à areia da arena e aos props.

    // Gramado e morros fora da arena. Todos começam além dos muros para manter
    // o piso circular livre e sem conflito visual.
    const grassRings = [16.5, 21, 26, 31, 36, 41];
    for (let rIndex = 0; rIndex < grassRings.length; rIndex++) {
      const ringRadius = grassRings[rIndex];
      const patches = 28 + rIndex * 4;
      for (let i = 0; i < patches; i++) {
        const angle = (i / patches) * Math.PI * 2 + ((i * 17 + rIndex * 11) % 23) * 0.01;
        const x = Math.cos(angle) * (ringRadius + ((i * 5) % 7) * 0.22);
        const z = Math.sin(angle) * (ringRadius + ((i * 3) % 5) * 0.24);
        const grass = document.createElement("a-cone");
        grass.setAttribute("position", `${x} 0.10 ${z}`);
        grass.setAttribute("rotation", `0 ${((i * 47) % 360)} 0`);
        grass.setAttribute("radius-bottom", `${0.10 + (i % 3) * 0.035}`);
        grass.setAttribute("height", `${0.28 + (i % 4) * 0.045}`);
        grass.setAttribute("segments-radial", "5");
        grass.setAttribute("color", i % 2 === 0 ? "#3E8B3E" : "#52A34B");
        grass.setAttribute("material", "shader: flat; roughness: 1; metalness: 0");
        this.el.appendChild(grass);
      }
    }

    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + (i % 3) * 0.12;
      const distance = 29 + (i % 5) * 3.4;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const hill = document.createElement("a-sphere");
      hill.setAttribute("position", `${x} -0.78 ${z}`);
      hill.setAttribute("scale", `${5.5 + (i % 4)} ${1.25 + (i % 3) * 0.28} ${4.4 + (i % 5) * 0.7}`);
      hill.setAttribute("segments-width", "16");
      hill.setAttribute("segments-height", "8");
      hill.setAttribute("color", i % 2 === 0 ? "#2F6F35" : "#3F7F3C");
      hill.setAttribute("material", "roughness: 1; metalness: 0");
      this.el.appendChild(hill);
    }

    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + 0.18;
      const distance = 47 + (i % 4) * 4.2;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const height = 6.5 + (i % 5) * 1.1;
      const mountain = document.createElement("a-cone");
      mountain.setAttribute("position", `${x} ${height / 2 - 0.15} ${z}`);
      mountain.setAttribute("radius-bottom", `${5.2 + (i % 3) * 1.2}`);
      mountain.setAttribute("height", `${height}`);
      mountain.setAttribute("segments-radial", "7");
      mountain.setAttribute("color", i % 2 === 0 ? "#53614D" : "#647156");
      mountain.setAttribute("material", "roughness: 1; metalness: 0");
      this.el.appendChild(mountain);

      const cap = document.createElement("a-cone");
      cap.setAttribute("position", `${x} ${height - 0.95} ${z}`);
      cap.setAttribute("radius-bottom", `${1.45 + (i % 2) * 0.35}`);
      cap.setAttribute("height", "1.35");
      cap.setAttribute("segments-radial", "7");
      cap.setAttribute("color", "#DCE8EF");
      cap.setAttribute("material", "roughness: 1; metalness: 0");
      this.el.appendChild(cap);
    }

    // Floresta cênica ao redor da arena. Fica fora dos muros para manter a arena intacta
    // e usa posições determinísticas para não mudar a cada recarregamento.
    const forestPalette = ["#1F6B37", "#287A3D", "#2F6F35", "#18532C"];
    for (let i = 0; i < 72; i++) {
      const angle = (i / 72) * Math.PI * 2 + ((i % 5) * 0.045);
      const ring = 18.8 + ((i * 7) % 24);
      const jitter = ((i * 13) % 9) * 0.18;
      const distance = ring + jitter;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const height = 2.7 + ((i * 11) % 12) * 0.16;

      const tree = document.createElement("a-entity");
      tree.setAttribute("position", `${x} 0 ${z}`);
      tree.setAttribute("rotation", `0 ${((i * 37) % 360)} 0`);

      const trunk = document.createElement("a-cylinder");
      trunk.setAttribute("position", `0 ${height * 0.28} 0`);
      trunk.setAttribute("radius", `${0.11 + ((i % 4) * 0.025)}`);
      trunk.setAttribute("height", `${height * 0.56}`);
      trunk.setAttribute("color", i % 3 === 0 ? "#4A2F1B" : "#3A2416");
      trunk.setAttribute("material", "roughness: 1; metalness: 0");
      tree.appendChild(trunk);

      const canopy1 = document.createElement("a-cone");
      canopy1.setAttribute("position", `0 ${height * 0.76} 0`);
      canopy1.setAttribute("radius-bottom", `${0.85 + ((i % 5) * 0.09)}`);
      canopy1.setAttribute("height", `${height * 0.58}`);
      canopy1.setAttribute("segments-radial", "8");
      canopy1.setAttribute("color", forestPalette[i % forestPalette.length]);
      canopy1.setAttribute("material", "roughness: 1; metalness: 0");
      tree.appendChild(canopy1);

      const canopy2 = document.createElement("a-cone");
      canopy2.setAttribute("position", `0 ${height * 1.03} 0`);
      canopy2.setAttribute("radius-bottom", `${0.58 + ((i % 4) * 0.08)}`);
      canopy2.setAttribute("height", `${height * 0.45}`);
      canopy2.setAttribute("segments-radial", "8");
      canopy2.setAttribute("color", forestPalette[(i + 1) % forestPalette.length]);
      canopy2.setAttribute("material", "roughness: 1; metalness: 0");
      tree.appendChild(canopy2);

      this.el.appendChild(tree);
    }

    // Chãos externos removidos para não competir com a areia da arena.

    const floor = document.createElement("a-cylinder");
    floor.setAttribute("position", "0 0.012 0");
    floor.setAttribute("radius", "12.15");
    floor.setAttribute("height", "0.045");
    floor.setAttribute("segments-radial", "96");
    floor.setAttribute("color", "#E6C98B");
    floor.setAttribute("material", "src: #sandTexture; repeat: 10 10; roughness: 1; metalness: 0; color: #E8CB91");
    this.el.appendChild(floor);

    // Marcações, anéis e rúnicas removidos: arena limpa com areia + props.

    const addSwordProp = (x, z, yaw) => {
      const sword = document.createElement("a-entity");
      sword.setAttribute("position", `${x} 0.085 ${z}`);
      sword.setAttribute("rotation", `0 ${yaw} 0`);

      const blade = document.createElement("a-box");
      blade.setAttribute("position", "0 0 0");
      blade.setAttribute("width", "0.08");
      blade.setAttribute("height", "0.035");
      blade.setAttribute("depth", "1.05");
      blade.setAttribute("color", "#B9C1C7");
      blade.setAttribute("material", "roughness: 0.55; metalness: 0.25");
      sword.appendChild(blade);

      const guard = document.createElement("a-box");
      guard.setAttribute("position", "0 0.012 0.58");
      guard.setAttribute("width", "0.42");
      guard.setAttribute("height", "0.04");
      guard.setAttribute("depth", "0.08");
      guard.setAttribute("color", "#8A6A32");
      sword.appendChild(guard);

      const grip = document.createElement("a-cylinder");
      grip.setAttribute("position", "0 0.02 0.78");
      grip.setAttribute("rotation", "90 0 0");
      grip.setAttribute("radius", "0.045");
      grip.setAttribute("height", "0.32");
      grip.setAttribute("color", "#3B2718");
      sword.appendChild(grip);

      this.el.appendChild(sword);
    };

    const addShieldProp = (x, z, yaw) => {
      const shield = document.createElement("a-entity");
      shield.setAttribute("position", `${x} 0.09 ${z}`);
      shield.setAttribute("rotation", `78 ${yaw} 0`);

      const body = document.createElement("a-cylinder");
      body.setAttribute("radius", "0.42");
      body.setAttribute("height", "0.07");
      body.setAttribute("segments-radial", "18");
      body.setAttribute("color", "#6C3A2E");
      body.setAttribute("material", "roughness: 0.75; metalness: 0.08");
      shield.appendChild(body);

      const boss = document.createElement("a-sphere");
      boss.setAttribute("position", "0 0.055 0");
      boss.setAttribute("radius", "0.16");
      boss.setAttribute("scale", "1 0.35 1");
      boss.setAttribute("color", "#B8A36B");
      boss.setAttribute("material", "roughness: 0.55; metalness: 0.25");
      shield.appendChild(boss);

      this.el.appendChild(shield);
    };

    // Caveiras removidas: somente espadas e escudos ficam sobre a areia.

    addSwordProp(-8.4, -2.9, 38);
    addSwordProp(7.2, 3.8, -52);
    addSwordProp(-4.2, 7.6, 118);
    addShieldProp(8.7, -2.8, -22);
    addShieldProp(-7.4, 4.8, 38);
    // Caveiras removidas. Mais armas e escudos deixam a arena com detalhes sem pesar o visual.
    addSwordProp(2.8, -7.8, 92);
    addSwordProp(-6.6, -6.7, -18);
    addSwordProp(5.9, 6.2, 142);
    addSwordProp(-2.2, 8.9, 64);
    addShieldProp(3.9, 8.1, -74);
    addShieldProp(-5.8, -8.0, 112);
    addShieldProp(6.6, -6.5, 24);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const isPillar = i % 6 === 0;

      const wall = document.createElement("a-box");
      wall.setAttribute("position", `${x} ${isPillar ? 1.25 : 0.9} ${z}`);
      wall.setAttribute("rotation", `0 ${(-angle * 180 / Math.PI) + 90} 0`);
      wall.setAttribute("width", isPillar ? "1.25" : "1.9");
      wall.setAttribute("height", isPillar ? "2.5" : "1.8");
      wall.setAttribute("depth", isPillar ? "0.55" : "0.34");
      wall.setAttribute("color", isPillar ? "#4B3A2B" : (i % 2 === 0 ? "#5E4935" : "#6B543E"));
      wall.setAttribute("material", "roughness: 0.9; metalness: 0.03");
      this.el.appendChild(wall);

      if (isPillar) {
        const torchGroup = document.createElement("a-entity");
        const inwardX = Math.cos(angle) * (radius - 0.72);
        const inwardZ = Math.sin(angle) * (radius - 0.72);
        torchGroup.setAttribute("position", `${inwardX} 1.46 ${inwardZ}`);
        torchGroup.setAttribute("rotation", `0 ${(-angle * 180 / Math.PI) + 270} 0`);

        const torchModel = document.createElement("a-entity");
        torchModel.setAttribute("gltf-model", "#torchModel");
        torchModel.setAttribute("scale", "0.92 0.92 0.92");
        torchModel.setAttribute("rotation", "0 0 0");
        torchGroup.appendChild(torchModel);

        const glow = document.createElement("a-light");
        glow.setAttribute("type", "point");
        glow.setAttribute("position", "0 0.9 0");
        glow.setAttribute("intensity", "0.7");
        glow.setAttribute("distance", "7.5");
        glow.setAttribute("color", "#FFB45C");
        torchGroup.appendChild(glow);

        this.el.appendChild(torchGroup);
      }
    }
  }
});

AFRAME.registerComponent("head-input", {
  schema: {
    dodgeThreshold: { default: 0.16 },
    duckThreshold: { default: 0.08 },
    attackThreshold: { default: 0.16 },
    rollThreshold: { default: 0.26 },
    pitchDuckThreshold: { default: 0.14 },
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
    this.highMagicFx = this.el.querySelector("#highMagicFx");
    this.swordSlashFxTimeout = null;
    this.swordSlashFxRaf = null;
    this.magicFxTimeout = null;
    this.magicFxRaf = null;
    this.modelMixers = new Map();
    this.modelActionsByEl = new WeakMap();
    this.currentAction = null;
    this.pendingIdleTimeout = null;
    this.pendingAttackTimeout = null;
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
      if (this.highMagicFx) this.highMagicFx.setAttribute("visible", "false");
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
      if (this.pendingAttackTimeout) {
        clearTimeout(this.pendingAttackTimeout);
        this.pendingAttackTimeout = null;
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
        const customTimeScale = Number.isFinite(Number(options.timeScale)) ? Math.max(0.05, Math.abs(Number(options.timeScale))) : 1;

        if (this.currentAction && this.currentAction !== action) {
          this.currentAction.fadeOut(0.08);
        }

        action.reset();
        action.enabled = true;
        action.clampWhenFinished = clampWhenFinished;
        action.setLoop(loop === "repeat" ? THREE.LoopRepeat : THREE.LoopOnce, loop === "repeat" ? Infinity : 1);
        action.timeScale = shouldReverse ? -customTimeScale : customTimeScale;
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

    // play defeat sfx specific to this enemy
    try {
      const key = profile && profile.key ? profile.key : null;
      let defeatSfxId = null;
      if (key === 'king') defeatSfxId = 'king-defeat';
      else if (key === 'adventurer') defeatSfxId = 'adventurer-defeat';
      else if (key === 'witch') defeatSfxId = 'witch-defeat';

      if (defeatSfxId) {
        playSfx(defeatSfxId);
      }

      // rare easter-egg chance to play a silly sample on enemy defeat
      const easterEggChance = 0.05; // 5% chance
      if (Math.random() < easterEggChance) {
        const eggs = ['roblox-oof', 'lego-yoda', 'wilhelm-scream'];
        const pick = eggs[Math.floor(Math.random() * eggs.length)];
        playSfx(pick);
      }
    } catch (e) {
      console.warn('play defeat sfx failed', e);
    }

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
    const normalFx = this.magicFx || this.el.querySelector("#magicFx");
    const highFx = this.highMagicFx || this.el.querySelector("#highMagicFx");
    const fx = pattern === "high" && highFx ? highFx : normalFx;
    if (!fx) return;

    if (this.magicFxTimeout) clearTimeout(this.magicFxTimeout);
    if (this.magicFxRaf) cancelAnimationFrame(this.magicFxRaf);
    if (normalFx) normalFx.setAttribute("visible", "false");
    if (highFx) highFx.setAttribute("visible", "false");

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
      // Ataque alto: a magia passa por cima da cabeça, em linha horizontal, para pedir AGACHAR.
      high: new THREE.Vector3(0, 2.34, 0.52)
    };
    const endMap = {
      left: new THREE.Vector3(-0.34, 1.48, 2.12),
      right: new THREE.Vector3(0.34, 1.48, 2.12),
      high: new THREE.Vector3(0, 2.08, 2.35)
    };

    const startPos = startMap[pattern] || startMap.high;
    const endPos = endMap[pattern] || endMap.high;
    const startedAt = performance.now();
    const duration = pattern === "high" ? 520 : 460;

    fx.setAttribute("visible", "true");
    fx.object3D.position.copy(startPos);
    fx.object3D.rotation.set(0, 0, pattern === "high" ? 0 : fx.object3D.rotation.z);
    fx.object3D.scale.set(0.18, 0.18, 0.18);
    setFxOpacity(0.9);

    const animate = (now) => {
      const t = Math.min(1, (now - startedAt) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      const pulse = 1 + Math.sin(t * Math.PI * 4) * 0.12;
      fx.object3D.position.lerpVectors(startPos, endPos, ease);
      if (pattern === "high") {
        fx.object3D.scale.set(0.42 + 0.42 * ease, 0.42 + 0.16 * ease, 0.42 + 0.22 * ease);
        fx.object3D.rotation.z = Math.sin(t * Math.PI * 3) * 0.06;
      } else {
        fx.object3D.scale.setScalar((0.18 + 0.62 * ease) * pulse);
        fx.object3D.rotation.y += 0.18;
      }
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

  openDefenseWindow: function (pattern, sourceType = "attack", attackSfxSwing = null, attackSfxHit = null) {
    const expected = this.getResponseActionForPattern(pattern);
    if (typeof openPrompt === "function") {
      openPrompt(expected, {
        label: sourceType === "magic" ? "MAGIA" : "DEFENDA-SE",
        resultText: sourceType === "magic" ? "Leia a origem da magia." : "Leia o movimento do inimigo.",
        attackSfxSwing: attackSfxSwing,
        attackSfxHit: attackSfxHit
      });
    }
  },

  physicalAttack: function (pattern) {
    const profile = typeof getEnemyProfile === "function" ? getEnemyProfile(getActiveDifficultyPhase()) : null;
    const clips = profile && profile.attacks ? profile.attacks : {};
    const clip = clips[pattern] || "CharacterArmature|Punch_Right";
    const options = clips[`${pattern}Options`] || {};
    const usesSwordFx = Boolean(options.swordFx);
    const windupMs = profile && profile.windupMs ? Number(profile.windupMs) : 0;
    const windupClips = profile && profile.windupClips ? profile.windupClips : null;
    const windupClip = windupClips && windupClips[pattern]
      ? windupClips[pattern]
      : (profile && profile.windupClip ? profile.windupClip : null);

    // Determine SFX for this attack and open defense window accordingly.
    let attackSwingSfx = null;
    let attackHitSfx = null;
    if (profile && profile.key === 'king') {
      attackSwingSfx = 'punch-swing';
      attackHitSfx = 'punch-hit';
    } else if (profile && profile.key === 'adventurer') {
      if (usesSwordFx && pattern === 'left') {
        attackSwingSfx = 'sword-swing';
        attackHitSfx = 'sword-hit';
      } else {
        attackSwingSfx = 'punch-swing';
        attackHitSfx = 'punch-hit';
      }
    } else if (profile && profile.key === 'witch') {
      attackSwingSfx = 'magic-swing';
      attackHitSfx = 'magic-hit';
    }

    // A janela abre assim que o movimento começa. No Rei, primeiro vem um wind-up lento e claro;
    // se o jogador ler o golpe cedo, ele já pode desviar antes do soco sair.
    this.openDefenseWindow(pattern, "attack", attackSwingSfx, attackHitSfx);

    if (windupMs > 0 && windupClip) {
      const windupOptions = profile.windupOptions || { timeScale: 0.45 };
      const holdAndContinue = Boolean(windupOptions.holdAtWindup);
      const playedWindup = this.playModelClip(windupClip, "once", true, windupOptions);

      this.pendingAttackTimeout = setTimeout(() => {
        this.pendingAttackTimeout = null;
        if (!game.running || this.isDefeated) return;

        let attackStarted = false;
        // Para o Rei, o wind-up e o soco usam o MESMO clip e a mesma mão.
        // Em vez de reiniciar outra animação depois do aviso, continuamos o próprio clip em velocidade normal.
        if (holdAndContinue && windupClip === clip && this.currentAction) {
          this.currentAction.paused = false;
          this.currentAction.enabled = true;
          this.currentAction.clampWhenFinished = true;
          this.currentAction.timeScale = 1.15;
          attackStarted = true;
        } else {
          attackStarted = this.playModelClip(clip, "once", true, options);
        }

        if (attackStarted) {
          if (usesSwordFx) this.playSwordSlashFx();
          try {
            if (attackSwingSfx) {
              playSfx(attackSwingSfx);
            }
          } catch (e) { console.warn('play swing sfx failed', e); }
        }
      }, windupMs);

      this.scheduleIdleReturn(windupMs + 980);
      return;
    }

    if (this.playModelClip(clip, "once", true, options)) {
      if (usesSwordFx) this.playSwordSlashFx();
      // play immediate swing sfx
      try {
        if (attackSwingSfx) {
          playSfx(attackSwingSfx);
        }
      } catch (e) { console.warn('play swing sfx failed', e); }
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
    // determine sfx for magic attacks
    let attackSwingSfx = null;
    let attackHitSfx = null;
    if (profile && profile.key === 'witch') {
      attackSwingSfx = 'magic-swing';
      attackHitSfx = 'magic-hit';
    }

    this.openDefenseWindow(pattern, "magic", attackSwingSfx, attackHitSfx);
    this.playModelClip(clip, "once", true);
    // play magic swing sfx
    try {
      if (attackSwingSfx) {
        playSfx(attackSwingSfx);
      }
    } catch (e) { console.warn('play magic swing sfx failed', e); }
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