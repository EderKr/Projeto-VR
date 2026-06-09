(function () {
  const video = document.getElementById("poseControlVideo");
  const canvas = document.getElementById("poseControlCanvas");
  const ctx = canvas ? canvas.getContext("2d", { willReadFrequently: true }) : null;
  const toggleButton = document.getElementById("poseGameToggle");
  const calibrateButton = document.getElementById("poseGameCalibrate");
  const invertInput = document.getElementById("poseGameInvert");
  const statusEl = document.getElementById("poseGameStatus");
  const actionEl = document.getElementById("poseGameAction");
  const hintEl = document.getElementById("poseGameHint");

  const avatar = document.getElementById("bodyMirrorAvatar");
  const characterModel = document.getElementById("bodyMirrorCharacterModel");
  const avatarTorso = document.getElementById("bodyMirrorTorso");
  const avatarHead = document.getElementById("bodyMirrorHead");
  const avatarShoulders = document.getElementById("bodyMirrorShoulders");
  const avatarHips = document.getElementById("bodyMirrorHips");
  const avatarLeftHand = document.getElementById("bodyMirrorLeftHand");
  const avatarRightHand = document.getElementById("bodyMirrorRightHand");

  if (!video || !canvas || !ctx || !toggleButton) return;

  const params = new URLSearchParams(window.location.search);
  const ROOM_STORAGE_KEY = "hb_room_code";
  const SMOOTHING = 0.38;
  const MIN_FULL_BODY_QUALITY = 0.78;
  const LOCAL_POSE_SEND_MS = 80;

  const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
    [27, 31], [28, 32]
  ];
  const FULL_BODY_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
  const HIDDEN_AFRAME_IDS = [
    "enemy",
    "worldHud",
    "pauseButtonVR",
    "menuMainScreen",
    "menuCustomizeScreen",
    "menuHistoryScreen"
  ];
  const HIDDEN_DOM_IDS = ["pauseMenuDesktopToggle", "logoutButton", "userBadge", "pauseMenuDesktop"];
  const BONE_ALIASES = {
    hips: ["Hips"],
    neck: ["Neck"],
    head: ["Head"],
    shoulderL: ["Shoulder.L"],
    upperArmL: ["UpperArm.L"],
    lowerArmL: ["LowerArm.L"],
    wristL: ["Wrist.L"],
    shoulderR: ["Shoulder.R"],
    upperArmR: ["UpperArm.R"],
    lowerArmR: ["LowerArm.R"],
    wristR: ["Wrist.R"],
    upperLegL: ["UpperLeg.L"],
    lowerLegL: ["LowerLeg.L"],
    footL: ["Foot.L"],
    upperLegR: ["UpperLeg.R"],
    lowerLegR: ["LowerLeg.R"],
    footR: ["Foot.R"]
  };

  let enabled = false;
  let mirrorMode = false;
  let stream = null;
  let rafId = 0;
  let poseLandmarker = null;
  let loadingPose = false;
  let lastVideoTime = -1;
  let baseline = null;
  let lastActionAt = 0;
  let lastActionName = "--";
  let lastPoseSentAt = 0;
  let smoothedLandmarks = null;
  let stableRegistrationFrames = 0;
  let roomSocket = null;
  let roomReconnectTimer = 0;
  let roomCode = resolveRoomCode();
  let currentModelAsset = "";
  let rigBones = {};
  let rigBaseRotations = {};
  let rigBaseQuaternions = {};
  let rigSegments = {};
  const hiddenState = new Map();

  function sanitizeRoomCode(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 18);
  }

  function createRoomCode() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  function resolveRoomCode() {
    const room = sanitizeRoomCode(params.get("room"))
      || sanitizeRoomCode(localStorage.getItem(ROOM_STORAGE_KEY))
      || createRoomCode();
    localStorage.setItem(ROOM_STORAGE_KEY, room);
    return room;
  }

  function setStatus(value) {
    if (statusEl) statusEl.textContent = value;
  }

  function setHint(value) {
    if (hintEl) hintEl.textContent = value;
  }

  function setAction(value) {
    lastActionName = value || "--";
    if (actionEl) actionEl.textContent = `acao: ${lastActionName}`;
  }

  function setRoomStatus(value) {
    if (!roomCode) return;
    setStatus(`${value} sala ${roomCode}`);
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function degToRad(value) {
    return value * Math.PI / 180;
  }

  function normalizeAngle(angle) {
    let result = angle;
    while (result > Math.PI) result -= Math.PI * 2;
    while (result < -Math.PI) result += Math.PI * 2;
    return result;
  }

  function getUserGender() {
    const user = window.authState && window.authState.user;
    return user && user.gender === "female" ? "female" : "male";
  }

  function applyCharacterModel() {
    if (!characterModel) return;
    const model = getUserGender() === "female" ? "#adventurerFemaleModel" : "#adventurerMaleModel";
    if (currentModelAsset === model) return;
    currentModelAsset = model;
    rigBones = {};
    rigBaseRotations = {};
    rigBaseQuaternions = {};
    rigSegments = {};
    characterModel.setAttribute("gltf-model", model);
    scheduleRigCache();
  }

  function getThree() {
    return window.THREE || (window.AFRAME && window.AFRAME.THREE) || null;
  }

  function cacheRigBones() {
    if (!characterModel) return 0;
    const THREE = getThree();
    if (!THREE) return 0;
    const root = characterModel.getObject3D("mesh") || characterModel.object3D;
    if (!root) return 0;

    const allBones = [];
    root.traverse((node) => {
      if (node && node.isBone) allBones.push(node);
      if (node && node.isSkinnedMesh && node.skeleton && Array.isArray(node.skeleton.bones)) {
        for (const bone of node.skeleton.bones) {
          if (bone && !allBones.includes(bone)) allBones.push(bone);
        }
      }
    });
    if (!allBones.length) return 0;

    const byName = new Map(allBones.map((bone) => [bone.name, bone]));
    const nextBones = {};
    const nextBase = {};
    const nextQuaternions = {};

    for (const [key, aliases] of Object.entries(BONE_ALIASES)) {
      const bone = aliases.map((name) => byName.get(name)).find(Boolean);
      if (!bone) continue;
      nextBones[key] = bone;
      nextBase[key] = {
        x: bone.rotation.x,
        y: bone.rotation.y,
        z: bone.rotation.z
      };
      nextQuaternions[key] = bone.quaternion.clone();
    }

    rigBones = nextBones;
    rigBaseRotations = nextBase;
    rigBaseQuaternions = nextQuaternions;
    rigSegments = buildRigSegments(THREE);
    return Object.keys(rigBones).length;
  }

  function buildRigSegments(THREE) {
    const pairs = {
      upperArmL: "lowerArmL",
      lowerArmL: "wristL",
      upperArmR: "lowerArmR",
      lowerArmR: "wristR",
      upperLegL: "lowerLegL",
      lowerLegL: "footL",
      upperLegR: "lowerLegR",
      lowerLegR: "footR",
      neck: "head"
    };
    const result = {};

    for (const [name, childName] of Object.entries(pairs)) {
      const bone = rigBones[name];
      const child = rigBones[childName];
      const baseQuat = rigBaseQuaternions[name];
      if (!bone || !child || !baseQuat) continue;

      const restParentDir = child.position.clone().applyQuaternion(baseQuat).normalize();
      if (!Number.isFinite(restParentDir.lengthSq()) || restParentDir.lengthSq() < 0.0001) continue;

      result[name] = {
        bone,
        child,
        baseQuat: baseQuat.clone(),
        restParentDir: restParentDir.clone(),
        targetDir: new THREE.Vector3(),
        deltaQuat: new THREE.Quaternion(),
        targetQuat: new THREE.Quaternion()
      };
    }

    return result;
  }

  function scheduleRigCache(attempt = 0) {
    if (cacheRigBones() > 0) return;
    if (attempt > 40) return;
    window.setTimeout(() => scheduleRigCache(attempt + 1), 180);
  }

  function rotateBone(name, x = 0, y = 0, z = 0, amount = 0.5) {
    const bone = rigBones[name];
    const base = rigBaseRotations[name];
    if (!bone || !base) return;

    bone.rotation.x = lerp(bone.rotation.x, base.x + x, amount);
    bone.rotation.y = lerp(bone.rotation.y, base.y + y, amount);
    bone.rotation.z = lerp(bone.rotation.z, base.z + z, amount);
    bone.updateMatrix();
    bone.updateMatrixWorld(true);
  }

  function resetRigPose() {
    for (const [name, bone] of Object.entries(rigBones)) {
      const base = rigBaseQuaternions[name];
      if (!bone || !base) continue;
      bone.quaternion.copy(base);
      bone.updateMatrix();
      bone.updateMatrixWorld(true);
    }
  }

  function vectorFromPosePoints(from, to, scaleX = 1) {
    const THREE = getThree();
    if (!THREE || !from || !to) return null;
    const vector = new THREE.Vector3(
      (to.x - from.x) * scaleX,
      (from.y - to.y) * 1.25,
      ((from.z || 0) - (to.z || 0)) * 0.85
    );
    if (!Number.isFinite(vector.lengthSq()) || vector.lengthSq() < 0.0001) return null;
    return vector.normalize();
  }

  function aimSegment(name, from, to, amount = 0.82, scaleX = 1) {
    const segment = rigSegments[name];
    if (!segment || !landmarkOk(from, 0.3) || !landmarkOk(to, 0.3)) return false;

    const target = vectorFromPosePoints(from, to, scaleX);
    if (!target) return false;

    segment.targetDir.copy(target);
    segment.deltaQuat.setFromUnitVectors(segment.restParentDir, segment.targetDir);
    segment.targetQuat.copy(segment.deltaQuat).multiply(segment.baseQuat);
    segment.bone.quaternion.slerp(segment.targetQuat, amount);
    segment.bone.updateMatrix();
    segment.bone.updateMatrixWorld(true);
    return true;
  }

  function landmarkOk(point, threshold = 0.45) {
    return point && (point.visibility == null || point.visibility > threshold);
  }

  function poseQuality(landmarks) {
    if (!Array.isArray(landmarks)) return 0;
    const visible = FULL_BODY_POINTS.filter((index) => landmarkOk(landmarks[index], 0.42)).length;
    return visible / FULL_BODY_POINTS.length;
  }

  function signedDegreesBetween(a, b) {
    if (!a || !b) return 0;
    return Math.atan2((b.y - a.y), (b.x - a.x)) * 180 / Math.PI;
  }

  function angleBetween(a, b) {
    if (!a || !b) return 0;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function getGameState() {
    if (typeof window.getGameInputState !== "function") {
      return { running: false, waitingInput: false, expectedAction: null };
    }
    return window.getGameInputState();
  }

  function sendRoomMessage(payload) {
    if (!roomSocket || roomSocket.readyState !== WebSocket.OPEN) return;
    roomSocket.send(JSON.stringify(payload));
  }

  function connectRoom() {
    if (!("WebSocket" in window) || !roomCode) {
      setRoomStatus("sem ws");
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(roomCode)}&role=game`;

    try {
      roomSocket = new WebSocket(url);
    } catch (error) {
      setRoomStatus("erro");
      return;
    }

    roomSocket.addEventListener("open", () => setRoomStatus("conectado"));
    roomSocket.addEventListener("message", (event) => {
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }
      handleRoomMessage(message);
    });
    roomSocket.addEventListener("close", () => {
      setRoomStatus("reconectando");
      clearTimeout(roomReconnectTimer);
      roomReconnectTimer = setTimeout(connectRoom, 1600);
    });
    roomSocket.addEventListener("error", () => setRoomStatus("erro"));
  }

  function handleRoomMessage(message) {
    if (!message || typeof message !== "object") return;

    if (message.type === "room-ready" || message.type === "peer-joined" || message.type === "peer-left") {
      const peerCount = Array.isArray(message.peers) ? Math.max(0, message.peers.length - 1) : 0;
      setRoomStatus(peerCount > 0 ? `${peerCount + 1} online` : "conectado");
      return;
    }

    if (message.type === "pose-action" && message.action) {
      const state = getGameState();
      setAction(`${message.action} remoto`);
      if (state.running && state.waitingInput && typeof window.dispatchGameAction === "function") {
        window.dispatchGameAction(message.action, "visao corporal remota");
      }
    }

    if (message.type === "pose-state" && mirrorMode && message.features) {
      updateAvatar(message.features, { remote: true });
      updateHint(message.features, null, message.quality || 0);
    }
  }

  async function ensurePoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    if (loadingPose) {
      while (loadingPose && !poseLandmarker) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return poseLandmarker;
    }

    loadingPose = true;
    setRoomStatus("carregando");

    try {
      const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35");
      const resolver = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm"
      );

      poseLandmarker = await vision.PoseLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6
      });

      setRoomStatus("ativo");
      return poseLandmarker;
    } finally {
      loadingPose = false;
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRoomStatus("sem camera");
      setHint("getUserMedia indisponivel");
      return false;
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      }
    });
    video.srcObject = stream;
    await video.play();
    return true;
  }

  function hideDomElement(element) {
    if (!element || hiddenState.has(element)) return;
    hiddenState.set(element, {
      mode: "dom",
      display: element.style.display,
      ariaHidden: element.getAttribute("aria-hidden")
    });
    element.style.display = "none";
    element.setAttribute("aria-hidden", "true");
  }

  function hideAFrameElement(element) {
    if (!element || hiddenState.has(element)) return;
    hiddenState.set(element, {
      mode: "aframe",
      visible: element.getAttribute("visible")
    });
    element.setAttribute("visible", "false");
  }

  function restoreHiddenElements() {
    for (const [element, state] of hiddenState.entries()) {
      if (state.mode === "dom") {
        element.style.display = state.display || "";
        if (state.ariaHidden == null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", state.ariaHidden);
      } else {
        const visible = state.visible == null ? "true" : String(state.visible);
        element.setAttribute("visible", visible);
      }
    }
    hiddenState.clear();
  }

  function setMirrorMode(active) {
    if (mirrorMode === active) return;
    mirrorMode = active;

    if (!active) {
      restoreHiddenElements();
      if (avatar) avatar.setAttribute("visible", "false");
      resetRigPose();
      sendRoomMessage({ type: "mirror-state", active: false });
      return;
    }

    if (typeof resetGame === "function") resetGame();
    const pauseMenu = document.getElementById("pauseMenuDesktop");
    if (pauseMenu) pauseMenu.classList.remove("open");

    for (const id of HIDDEN_DOM_IDS) hideDomElement(document.getElementById(id));
    hideDomElement(document.querySelector(".game-topbar"));
    for (const id of HIDDEN_AFRAME_IDS) hideAFrameElement(document.getElementById(id));

    if (avatar) avatar.setAttribute("visible", "true");
    sendRoomMessage({ type: "mirror-state", active: true });
  }

  function stop() {
    enabled = false;
    toggleButton.textContent = "Ativar";
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastVideoTime = -1;
    baseline = null;
    smoothedLandmarks = null;
    stableRegistrationFrames = 0;

    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }

    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSimulationFrame();
    setMirrorMode(false);
    setRoomStatus(roomSocket && roomSocket.readyState === WebSocket.OPEN ? "conectado" : "offline");
    setAction("--");
    setHint("nao diagnostico");
  }

  function drawSimulationFrame(landmarks) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#07131F";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "rgba(242, 140, 40, 0.18)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(255, 232, 182, 0.10)";
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.52, width * 0.13, height * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    if (Array.isArray(landmarks) && landmarks.length > 0) drawPose(landmarks);
    else {
      ctx.strokeStyle = "rgba(255, 232, 182, 0.72)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.26, 18, 0, Math.PI * 2);
      ctx.moveTo(width * 0.36, height * 0.44);
      ctx.lineTo(width * 0.64, height * 0.44);
      ctx.moveTo(width * 0.5, height * 0.35);
      ctx.lineTo(width * 0.5, height * 0.72);
      ctx.moveTo(width * 0.43, height * 0.72);
      ctx.lineTo(width * 0.36, height * 0.90);
      ctx.moveTo(width * 0.57, height * 0.72);
      ctx.lineTo(width * 0.64, height * 0.90);
      ctx.stroke();
    }
  }

  function drawPose(landmarks) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#F28C28";
    ctx.fillStyle = "#FFE8B6";

    for (const [from, to] of POSE_CONNECTIONS) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!landmarkOk(a) || !landmarkOk(b)) continue;
      ctx.beginPath();
      ctx.moveTo((1 - a.x) * canvas.width, a.y * canvas.height);
      ctx.lineTo((1 - b.x) * canvas.width, b.y * canvas.height);
      ctx.stroke();
    }

    for (const index of FULL_BODY_POINTS) {
      const point = landmarks[index];
      if (!landmarkOk(point)) continue;
      ctx.beginPath();
      ctx.arc((1 - point.x) * canvas.width, point.y * canvas.height, index === 0 ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function smoothLandmarks(landmarks) {
    if (!Array.isArray(landmarks)) return null;
    if (!smoothedLandmarks || smoothedLandmarks.length !== landmarks.length) {
      smoothedLandmarks = landmarks.map((point) => ({ ...point }));
      return smoothedLandmarks;
    }

    for (let index = 0; index < landmarks.length; index += 1) {
      const next = landmarks[index];
      const previous = smoothedLandmarks[index] || next;
      if (!next) {
        smoothedLandmarks[index] = previous;
        continue;
      }
      smoothedLandmarks[index] = {
        ...next,
        x: lerp(previous.x || 0, next.x || 0, SMOOTHING),
        y: lerp(previous.y || 0, next.y || 0, SMOOTHING),
        z: lerp(previous.z || 0, next.z || 0, SMOOTHING),
        visibility: next.visibility
      };
    }

    return smoothedLandmarks;
  }

  function pointPayload(point) {
    if (!point) return null;
    return {
      x: Number(point.x.toFixed(4)),
      y: Number(point.y.toFixed(4)),
      z: Number((point.z || 0).toFixed(4)),
      visibility: point.visibility == null ? 1 : Number(point.visibility.toFixed(3))
    };
  }

  function compactFeatures(features) {
    if (!features) return null;
    const points = {};
    for (const key of [
      "nose", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow",
      "leftWrist", "rightWrist", "leftHip", "rightHip", "leftKnee",
      "rightKnee", "leftAnkle", "rightAnkle"
    ]) {
      points[key] = pointPayload(features[key]);
    }
    return {
      ...features,
      ...points,
      bodyCenter: pointPayload(features.bodyCenter),
      shoulderCenter: pointPayload(features.shoulderCenter),
      hipCenter: pointPayload(features.hipCenter)
    };
  }

  function readPoseFeatures(landmarks) {
    const nose = landmarks[0];
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftElbow = landmarks[13];
    const rightElbow = landmarks[14];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    if (![leftShoulder, rightShoulder, leftHip, rightHip, nose].every(landmarkOk)) return null;

    const shoulderCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
      z: ((leftShoulder.z || 0) + (rightShoulder.z || 0)) / 2
    };
    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2,
      z: ((leftHip.z || 0) + (rightHip.z || 0)) / 2
    };
    const bodyCenter = {
      x: (shoulderCenter.x + hipCenter.x) / 2,
      y: (shoulderCenter.y + hipCenter.y) / 2,
      z: (shoulderCenter.z + hipCenter.z) / 2
    };
    const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
    const bodyHeight = Math.abs(hipCenter.y - nose.y);
    const kneeCenterY = landmarkOk(leftKnee) && landmarkOk(rightKnee) ? (leftKnee.y + rightKnee.y) / 2 : hipCenter.y + 0.22;
    const stanceWidth = landmarkOk(leftAnkle) && landmarkOk(rightAnkle) ? Math.abs(rightAnkle.x - leftAnkle.x) : shoulderWidth;

    return {
      quality: poseQuality(landmarks),
      nose,
      leftShoulder,
      rightShoulder,
      leftElbow,
      rightElbow,
      leftWrist,
      rightWrist,
      leftHip,
      rightHip,
      leftKnee,
      rightKnee,
      leftAnkle,
      rightAnkle,
      bodyCenter,
      shoulderCenter,
      hipCenter,
      kneeCenterY,
      stanceWidth,
      shoulderWidth,
      bodyHeight,
      shoulderTilt: signedDegreesBetween(leftShoulder, rightShoulder),
      hipTilt: signedDegreesBetween(leftHip, rightHip),
      noseZ: nose.z || 0,
      shoulderZ: shoulderCenter.z,
      shoulderTwist: (rightShoulder.z || 0) - (leftShoulder.z || 0),
      headOffsetX: nose.x - shoulderCenter.x,
      upperArmAngleL: angleBetween(leftShoulder, leftElbow),
      lowerArmAngleL: angleBetween(leftElbow, leftWrist),
      upperArmAngleR: angleBetween(rightShoulder, rightElbow),
      lowerArmAngleR: angleBetween(rightElbow, rightWrist),
      upperLegAngleL: angleBetween(leftHip, leftKnee),
      lowerLegAngleL: angleBetween(leftKnee, leftAnkle),
      upperLegAngleR: angleBetween(rightHip, rightKnee),
      lowerLegAngleR: angleBetween(rightKnee, rightAnkle)
    };
  }

  function captureBaseline(features) {
    baseline = {
      centerX: features.bodyCenter.x,
      shoulderY: features.shoulderCenter.y,
      shoulderWidth: features.shoulderWidth,
      noseZ: features.noseZ,
      bodyHeight: features.bodyHeight,
      stanceWidth: features.stanceWidth
    };
    setHint("calibrado");
  }

  function chooseAction(features) {
    if (!baseline) captureBaseline(features);
    if (!baseline) return null;

    const invert = Boolean(invertInput && invertInput.checked);
    const lateral = features.bodyCenter.x - baseline.centerX;
    const duckDelta = features.shoulderCenter.y - baseline.shoulderY;
    const widthDelta = features.shoulderWidth - baseline.shoulderWidth;
    const depthDelta = features.noseZ - baseline.noseZ;
    const lean = features.shoulderTilt;
    const stanceDelta = features.stanceWidth - baseline.stanceWidth;

    if (duckDelta > 0.074 || features.kneeCenterY - features.hipCenter.y < 0.18) return "duck";
    if (widthDelta > 0.068 || depthDelta < -0.095 || stanceDelta > 0.10) return "attack";

    if (Math.abs(lateral) > 0.07 || Math.abs(lean) > 9 || Math.abs(features.headOffsetX) > 0.082) {
      const rawDirection = lateral > 0 || lean > 9 || features.headOffsetX > 0.082 ? "right" : "left";
      const direction = invert ? (rawDirection === "right" ? "left" : "right") : rawDirection;
      return direction === "left" ? "dodgeLeft" : "dodgeRight";
    }

    return null;
  }

  function dispatchPoseAction(action) {
    if (!action) return;

    const now = performance.now();
    if (now - lastActionAt < 520) return;
    lastActionAt = now;
    setAction(action);
    sendRoomMessage({ type: "pose-action", action });

    const state = getGameState();
    if (!state.running || !state.waitingInput) return;
    if (typeof window.dispatchGameAction !== "function") return;
    window.dispatchGameAction(action, "visao corporal");
  }

  function rotateLimbBones(features) {
    if (!rigBones.head && characterModel) cacheRigBones();
    if (!Object.keys(rigBones).length) return;

    const shoulderTilt = degToRad(features.shoulderTilt);
    const hipTilt = degToRad(features.hipTilt);
    const yaw = clamp(features.shoulderTwist * -1.8, -0.45, 0.45);
    const headYaw = clamp(features.headOffsetX * -2.4, -0.55, 0.55);
    const torsoCrouch = baseline ? clamp((features.shoulderCenter.y - baseline.shoulderY) * 2.8, 0, 0.38) : 0;

    rotateBone("hips", torsoCrouch, yaw * 0.25, -hipTilt * 0.45, 0.42);
    rotateBone("neck", 0, headYaw * 0.45, -shoulderTilt * 0.35, 0.48);
    rotateBone("head", 0, headYaw, -shoulderTilt * 0.58, 0.54);
    rotateBone("shoulderL", 0, 0, -shoulderTilt * 0.35, 0.44);
    rotateBone("shoulderR", 0, 0, -shoulderTilt * 0.35, 0.44);

    const aimed = {
      upperArmL: aimSegment("upperArmL", features.leftShoulder, features.leftElbow, 0.92),
      lowerArmL: aimSegment("lowerArmL", features.leftElbow, features.leftWrist, 0.92),
      upperArmR: aimSegment("upperArmR", features.rightShoulder, features.rightElbow, 0.92),
      lowerArmR: aimSegment("lowerArmR", features.rightElbow, features.rightWrist, 0.92),
      upperLegL: aimSegment("upperLegL", features.leftHip, features.leftKnee, 0.78),
      lowerLegL: aimSegment("lowerLegL", features.leftKnee, features.leftAnkle, 0.78),
      upperLegR: aimSegment("upperLegR", features.rightHip, features.rightKnee, 0.78),
      lowerLegR: aimSegment("lowerLegR", features.rightKnee, features.rightAnkle, 0.78)
    };

    const leftLowerArm = clamp(normalizeAngle(features.lowerArmAngleL - Math.PI / 2), -1.45, 1.45);
    const rightLowerArm = clamp(normalizeAngle(features.lowerArmAngleR - Math.PI / 2), -1.45, 1.45);
    const leftLowerLeg = clamp(normalizeAngle(features.lowerLegAngleL - Math.PI / 2), -0.95, 0.95);
    const rightLowerLeg = clamp(normalizeAngle(features.lowerLegAngleR - Math.PI / 2), -0.95, 0.95);

    if (!aimed.upperArmL) rotateBone("upperArmL", 0, 0, clamp(normalizeAngle(features.upperArmAngleL - Math.PI / 2), -1.25, 1.25), 0.72);
    if (!aimed.lowerArmL) rotateBone("lowerArmL", 0, 0, leftLowerArm, 0.72);
    if (!aimed.upperArmR) rotateBone("upperArmR", 0, 0, clamp(normalizeAngle(features.upperArmAngleR - Math.PI / 2), -1.25, 1.25), 0.72);
    if (!aimed.lowerArmR) rotateBone("lowerArmR", 0, 0, rightLowerArm, 0.72);
    if (!aimed.upperLegL) rotateBone("upperLegL", leftLowerLeg * 0.35, 0, leftLowerLeg * 0.25, 0.58);
    if (!aimed.upperLegR) rotateBone("upperLegR", rightLowerLeg * 0.35, 0, rightLowerLeg * 0.25, 0.58);

    rotateBone("wristL", leftLowerArm * 0.18, 0, leftLowerArm * 0.45, 0.62);
    rotateBone("wristR", rightLowerArm * 0.18, 0, rightLowerArm * 0.45, 0.62);
    rotateBone("footL", leftLowerLeg * 0.28, 0, 0, 0.5);
    rotateBone("footR", rightLowerLeg * 0.28, 0, 0, 0.5);

    if (characterModel) characterModel.object3D.updateMatrixWorld(true);
  }

  function updateAvatar(features, options = {}) {
    if (!avatar || !features) return;
    avatar.setAttribute("visible", "true");

    const lateral = baseline && !options.remote ? (features.bodyCenter.x - baseline.centerX) : (features.bodyCenter.x - 0.5);
    const crouch = baseline && !options.remote ? Math.max(0, features.shoulderCenter.y - baseline.shoulderY) : 0;
    const avatarX = clamp(lateral * -2.35, -0.8, 0.8);
    const avatarY = clamp(-crouch * 1.25, -0.26, 0.08);
    const yaw = clamp(features.shoulderTwist * -120, -24, 24);
    const roll = clamp(-features.shoulderTilt * 0.35, -10, 10);

    avatar.setAttribute("position", `${avatarX.toFixed(2)} ${avatarY.toFixed(2)} -3.2`);
    avatar.setAttribute("rotation", `0 ${yaw.toFixed(1)} 0`);

    if (characterModel) {
      characterModel.setAttribute("rotation", `0 0 ${roll.toFixed(1)}`);
      characterModel.setAttribute("scale", getUserGender() === "female" ? "1.04 1.04 1.04" : "1.08 1.08 1.08");
    }

    rotateLimbBones(features);

    if (avatarTorso) avatarTorso.setAttribute("rotation", `0 0 ${(-features.shoulderTilt).toFixed(1)}`);
    if (avatarShoulders) avatarShoulders.setAttribute("rotation", `0 0 ${(90 - features.shoulderTilt).toFixed(1)}`);
    if (avatarHips) avatarHips.setAttribute("rotation", `0 0 ${(90 - features.hipTilt).toFixed(1)}`);
    if (avatarHead) avatarHead.setAttribute("position", `${(-features.headOffsetX * 1.8).toFixed(2)} 0.72 0`);

    if (avatarLeftHand && landmarkOk(features.leftWrist)) {
      avatarLeftHand.setAttribute("position", `${((0.5 - features.leftWrist.x) * 1.4).toFixed(2)} ${((0.55 - features.leftWrist.y) * 1.25).toFixed(2)} 0`);
    }
    if (avatarRightHand && landmarkOk(features.rightWrist)) {
      avatarRightHand.setAttribute("position", `${((0.5 - features.rightWrist.x) * 1.4).toFixed(2)} ${((0.55 - features.rightWrist.y) * 1.25).toFixed(2)} 0`);
    }
  }

  function sendPoseState(features) {
    const now = performance.now();
    if (now - lastPoseSentAt < LOCAL_POSE_SEND_MS) return;
    lastPoseSentAt = now;
    sendRoomMessage({
      type: "pose-state",
      quality: features.quality,
      features: compactFeatures(features)
    });
  }

  function describeBias(features) {
    if (!features || !baseline) return "neutro";
    const shift = (features.bodyCenter.x - baseline.centerX) * 2;
    if (Math.abs(shift) > 0.16) return shift > 0 ? "tendencia direita" : "tendencia esquerda";
    if (Math.abs(features.shoulderTilt) > 7) return features.shoulderTilt > 0 ? "ombro direito baixo" : "ombro esquerdo baixo";
    return "central";
  }

  function updateRegistrationQuality(quality) {
    if (quality >= MIN_FULL_BODY_QUALITY) stableRegistrationFrames += 1;
    else stableRegistrationFrames = Math.max(0, stableRegistrationFrames - 2);
    return Math.min(100, Math.round((stableRegistrationFrames / 18) * 100));
  }

  function updateHint(features, action, quality = features ? features.quality : 0) {
    const rigLabel = Object.keys(rigBones).length ? "rig ok" : "rig aguardando";
    const registration = updateRegistrationQuality(quality);
    if (mirrorMode) {
      if (quality < MIN_FULL_BODY_QUALITY) {
        setHint(`registro ${Math.round(quality * 100)}% - ${rigLabel}`);
        return;
      }
      setHint(action ? `detectado: ${action} - ${rigLabel}` : `registro ${registration}% - ${describeBias(features)} - ${rigLabel}`);
      return;
    }

    const state = getGameState();
    if (!state.running) {
      setHint(`registro ${Math.round(quality * 100)}% - inicie o jogo`);
      return;
    }
    if (!state.waitingInput) {
      setHint("aguardando janela de reacao");
      return;
    }
    if (action) {
      setHint(`detectado: ${action}`);
      return;
    }
    setHint(`esperado: ${state.expectedAction || "--"}`);
  }

  function makeDebugPoint(x, y, z = 0) {
    return { x, y, z, visibility: 1 };
  }

  function createDebugLandmarks(raised = false) {
    const landmarks = [];
    landmarks[0] = makeDebugPoint(0.50, 0.16, -0.18);
    landmarks[11] = makeDebugPoint(0.38, 0.34, -0.12);
    landmarks[12] = makeDebugPoint(0.62, 0.34, -0.12);
    landmarks[13] = raised ? makeDebugPoint(0.30, 0.18, -0.16) : makeDebugPoint(0.32, 0.52, -0.10);
    landmarks[14] = raised ? makeDebugPoint(0.70, 0.18, -0.16) : makeDebugPoint(0.68, 0.52, -0.10);
    landmarks[15] = raised ? makeDebugPoint(0.26, 0.08, -0.20) : makeDebugPoint(0.30, 0.70, -0.08);
    landmarks[16] = raised ? makeDebugPoint(0.74, 0.08, -0.20) : makeDebugPoint(0.70, 0.70, -0.08);
    landmarks[23] = makeDebugPoint(0.43, 0.68, -0.10);
    landmarks[24] = makeDebugPoint(0.57, 0.68, -0.10);
    landmarks[25] = makeDebugPoint(0.43, 0.84, -0.08);
    landmarks[26] = makeDebugPoint(0.57, 0.84, -0.08);
    landmarks[27] = makeDebugPoint(0.42, 0.96, -0.06);
    landmarks[28] = makeDebugPoint(0.58, 0.96, -0.06);
    return landmarks;
  }

  function createDebugFeatures(raised = false) {
    return readPoseFeatures(createDebugLandmarks(raised));
  }

  function applyDebugPose(raised = true) {
    if (!avatar) return null;
    applyCharacterModel();
    scheduleRigCache();
    setMirrorMode(true);
    avatar.setAttribute("visible", "true");

    const neutral = createDebugFeatures(false);
    if (!baseline && neutral) captureBaseline(neutral);

    const features = createDebugFeatures(raised);
    if (!features) return null;
    updateAvatar(features);
    setHint(`${raised ? "teste rig: bracos altos" : "teste rig: bracos baixos"} - ${Object.keys(rigBones).length ? "rig ok" : "rig aguardando"}`);
    return {
      boneCount: Object.keys(rigBones).length,
      segmentCount: Object.keys(rigSegments).length,
      raised,
      upperArmL: rigBones.upperArmL ? {
        x: Number(rigBones.upperArmL.rotation.x.toFixed(3)),
        y: Number(rigBones.upperArmL.rotation.y.toFixed(3)),
        z: Number(rigBones.upperArmL.rotation.z.toFixed(3))
      } : null
    };
  }

  function startRigDebugLoop() {
    let raised = false;
    setMirrorMode(true);
    applyDebugPose(false);
    window.setInterval(() => {
      raised = !raised;
      applyDebugPose(raised);
    }, 850);
  }

  function frame() {
    if (!enabled) return;

    if (!video.videoWidth || !poseLandmarker) {
      drawSimulationFrame();
      rafId = requestAnimationFrame(frame);
      return;
    }

    drawSimulationFrame();

    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const result = poseLandmarker.detectForVideo(video, performance.now());
      const rawLandmarks = result && result.landmarks && result.landmarks[0];
      const landmarks = smoothLandmarks(rawLandmarks);

      if (landmarks) {
        drawSimulationFrame(landmarks);
        const features = readPoseFeatures(landmarks);
        if (features) {
          const action = chooseAction(features);
          updateAvatar(features);
          updateHint(features, action, features.quality);
          sendPoseState(features);
          dispatchPoseAction(action);
          if (!action && lastActionName !== "--") setAction("--");
        } else {
          setHint("fique de frente para a camera");
        }
      } else {
        setHint("corpo nao detectado");
      }
    }

    rafId = requestAnimationFrame(frame);
  }

  async function start() {
    enabled = true;
    toggleButton.textContent = "Desativar";
    setMirrorMode(true);
    applyCharacterModel();
    setRoomStatus("iniciando");
    setHint("pedindo camera");

    try {
      const cameraReady = await startCamera();
      if (!cameraReady) {
        stop();
        return;
      }
      await ensurePoseLandmarker();
      cacheRigBones();
      setRoomStatus("ativo");
      setHint("calibre em posicao neutra com corpo inteiro no quadro");
      frame();
    } catch (error) {
      setRoomStatus("erro");
      setHint("camera/modelo indisponivel");
      stop();
    }
  }

  toggleButton.addEventListener("click", () => {
    if (enabled) stop();
    else start();
  });

  if (calibrateButton) {
    calibrateButton.addEventListener("click", () => {
      baseline = null;
      stableRegistrationFrames = 0;
      setHint("calibrando no proximo frame");
    });
  }

  if (characterModel) {
    characterModel.addEventListener("model-loaded", () => {
      cacheRigBones();
      resetRigPose();
    });
  }

  window.addEventListener("auth-state-change", applyCharacterModel);
  applyCharacterModel();
  connectRoom();
  drawSimulationFrame();
  window.__corpusVRRigDebug = {
    cache: cacheRigBones,
    bones: () => Object.keys(rigBones),
    segments: () => Object.keys(rigSegments),
    neutral: () => applyDebugPose(false),
    raised: () => applyDebugPose(true)
  };

  if (params.get("mirror") === "1") {
    window.setTimeout(() => {
      if (!enabled) start();
    }, 700);
  }

  if (params.get("rigtest") === "1") {
    window.setTimeout(startRigDebugLoop, 900);
  }
})();
