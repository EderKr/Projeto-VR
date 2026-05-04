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