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
  const AXIS_STORAGE_KEY = "corpus_vr_rig_axes_mirror_v1";
  const MODEL_URL_STORAGE_KEY = "corpus_vr_model_url";
  const MIRROR_CAMERA = true;
  const SMOOTHING = 0.38;
  const MIN_FULL_BODY_QUALITY = 0.78;
  const LOCAL_POSE_SEND_MS = 80;
  const AUTO_CALIBRATION_FRAMES = 24;
  const AUTO_RECALIBRATION_FRAMES = 180;
  const MIN_CALIBRATION_QUALITY = 0.82;
  const JUMP_PRELOAD_DROP = 0.034;
  const JUMP_LIFT_THRESHOLD = 0.060;
  const JUMP_VELOCITY_THRESHOLD = 0.030;
  const JUMP_PRELOAD_WINDOW_MS = 900;
  const JUMP_LAND_RESET = 0.030;
  const POSE_DELEGATE = "CPU"; // CPU evita warnings WebGL/OpenGL do MediaPipe e é mais estável em PCs modestos.

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
    hips: ["Hips", "mixamorigHips"],
    spine: ["Spine", "mixamorigSpine"],
    chest: ["Spine1", "Spine2", "Chest", "UpperChest", "mixamorigSpine1", "mixamorigSpine2"],
    neck: ["Neck", "mixamorigNeck"],
    head: ["Head", "mixamorigHead"],
    shoulderL: ["Shoulder.L", "LeftShoulder", "mixamorigLeftShoulder"],
    upperArmL: ["UpperArm.L", "LeftArm", "LeftUpperArm", "mixamorigLeftArm"],
    lowerArmL: ["LowerArm.L", "LeftForeArm", "LeftLowerArm", "mixamorigLeftForeArm"],
    wristL: ["Wrist.L", "LeftHand", "mixamorigLeftHand"],
    shoulderR: ["Shoulder.R", "RightShoulder", "mixamorigRightShoulder"],
    upperArmR: ["UpperArm.R", "RightArm", "RightUpperArm", "mixamorigRightArm"],
    lowerArmR: ["LowerArm.R", "RightForeArm", "RightLowerArm", "mixamorigRightForeArm"],
    wristR: ["Wrist.R", "RightHand", "mixamorigRightHand"],
    upperLegL: ["UpperLeg.L", "LeftUpLeg", "LeftUpperLeg", "mixamorigLeftUpLeg"],
    lowerLegL: ["LowerLeg.L", "LeftLeg", "LeftLowerLeg", "mixamorigLeftLeg"],
    footL: ["Foot.L", "LeftFoot", "mixamorigLeftFoot"],
    upperLegR: ["UpperLeg.R", "RightUpLeg", "RightUpperLeg", "mixamorigRightUpLeg"],
    lowerLegR: ["LowerLeg.R", "RightLeg", "RightLowerLeg", "mixamorigRightLeg"],
    footR: ["Foot.R", "RightFoot", "mixamorigRightFoot"]
  };
  const LOCAL_MODEL_ASSETS = {
    male: {
      src: "#readyPlayerMaleModel",
      scale: "1.08 1.08 1.08"
    },
    female: {
      src: "#readyPlayerFemaleModel",
      scale: "1.08 1.08 1.08"
    }
  };
  const RIG_AXIS_PRESETS = {
    male: {
      global: { x: 1, y: 1, z: 1, xScale: 1, yScale: 1.25, zScale: 0.75, amount: 0.9 },
      segments: {
        neck: { x: 1, y: 1, z: 1, amount: 0.65 },
        head: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.62 },
        hips: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.46 },
        spine: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.44 },
        chest: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.48 },
        shoulderL: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.46 },
        shoulderR: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.46 },
        upperArmL: { x: 1, y: 1, z: 1, amount: 0.95 },
        lowerArmL: { x: 1, y: 1, z: 1, amount: 0.95 },
        wristL: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.65 },
        upperArmR: { x: 1, y: 1, z: 1, amount: 0.95 },
        lowerArmR: { x: 1, y: 1, z: 1, amount: 0.95 },
        wristR: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.65 },
        upperLegL: { x: 1, y: 1, z: 1, amount: 0.82 },
        lowerLegL: { x: 1, y: 1, z: 1, amount: 0.82 },
        footL: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.52 },
        upperLegR: { x: 1, y: 1, z: 1, amount: 0.82 },
        lowerLegR: { x: 1, y: 1, z: 1, amount: 0.82 },
        footR: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.52 }
      }
    },
    female: {
      global: { x: 1, y: 1, z: 1, xScale: 1, yScale: 1.18, zScale: 0.75, amount: 0.9 },
      segments: {
        neck: { x: 1, y: 1, z: 1, amount: 0.66 },
        head: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.62 },
        hips: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.46 },
        spine: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.44 },
        chest: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.48 },
        shoulderL: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.46 },
        shoulderR: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.46 },
        upperArmL: { x: 1, y: 1, z: 1, amount: 0.96 },
        lowerArmL: { x: 1, y: 1, z: 1, amount: 0.96 },
        wristL: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.65 },
        upperArmR: { x: 1, y: 1, z: 1, amount: 0.96 },
        lowerArmR: { x: 1, y: 1, z: 1, amount: 0.96 },
        wristR: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.65 },
        upperLegL: { x: 1, y: 1, z: 1, amount: 0.82 },
        lowerLegL: { x: 1, y: 1, z: 1, amount: 0.82 },
        footL: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.52 },
        upperLegR: { x: 1, y: 1, z: 1, amount: 0.82 },
        lowerLegR: { x: 1, y: 1, z: 1, amount: 0.82 },
        footR: { rotX: 1, rotY: 1, rotZ: 1, amount: 0.52 }
      }
    }
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
  let smoothedWorldLandmarks = null;
  let stableRegistrationFrames = 0;
  let calibrationSamples = [];
  let autoCalibrated = false;
  let neutralFrames = 0;
  let lastVisionErrorAt = 0;
  let roomSocket = null;
  let roomReconnectTimer = 0;
  let roomCode = resolveRoomCode();
  let currentModelAsset = "";
  let currentModelScale = "1.08 1.08 1.08";
  let rigBones = {};
  let rigBaseRotations = {};
  let rigBaseQuaternions = {};
  let rigSegments = {};
  let rigAxisOverrides = loadAxisOverrides();
  let lastRigCacheSignature = "";
  let jumpTracker = {
    lastY: null,
    lastTime: 0,
    preloadAt: 0,
    airborne: false
  };
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
    const forcedGender = normalizeModelKey(params.get("gender"));
    if (params.has("gender")) return forcedGender;

    const user = window.authState && window.authState.user;
    return user && user.gender === "female" ? "female" : "male";
  }

  function loadAxisOverrides() {
    try {
      const saved = JSON.parse(localStorage.getItem(AXIS_STORAGE_KEY) || "{}");
      return saved && typeof saved === "object" ? saved : {};
    } catch (error) {
      return {};
    }
  }

  function saveAxisOverrides() {
    localStorage.setItem(AXIS_STORAGE_KEY, JSON.stringify(rigAxisOverrides));
  }

  function clonePlain(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function normalizeModelKey(value) {
    const key = String(value || "").toLowerCase();
    return key === "female" || key === "mulher" || key === "feminino" ? "female" : "male";
  }

  function mergePlain(base, override) {
    return { ...(base || {}), ...(override || {}) };
  }

  function getAxisPreset(modelKey = getUserGender()) {
    const key = normalizeModelKey(modelKey);
    const base = clonePlain(RIG_AXIS_PRESETS[key] || RIG_AXIS_PRESETS.male);
    const override = rigAxisOverrides[key] || {};
    base.global = mergePlain(base.global, override.global);
    base.segments = base.segments || {};

    for (const [name, config] of Object.entries(override.segments || {})) {
      base.segments[name] = mergePlain(base.segments[name], config);
    }

    return base;
  }

  function getSegmentAxis(name) {
    const preset = getAxisPreset();
    return mergePlain(preset.global, preset.segments && preset.segments[name]);
  }

  function toFiniteNumber(value, fallback = 1) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function setAxisOverride(modelKey, segmentName, config) {
    const model = normalizeModelKey(modelKey || getUserGender());
    const segment = String(segmentName || "global");
    const cleaned = {};

    for (const [key, value] of Object.entries(config || {})) {
      if ([
        "x", "y", "z", "xScale", "yScale", "zScale",
        "rotX", "rotY", "rotZ", "amount"
      ].includes(key)) {
        cleaned[key] = toFiniteNumber(value, key === "amount" ? 0.9 : 1);
      }
    }

    rigAxisOverrides[model] = rigAxisOverrides[model] || { segments: {} };
    if (segment === "global") {
      rigAxisOverrides[model].global = mergePlain(rigAxisOverrides[model].global, cleaned);
    } else {
      rigAxisOverrides[model].segments = rigAxisOverrides[model].segments || {};
      rigAxisOverrides[model].segments[segment] = mergePlain(rigAxisOverrides[model].segments[segment], cleaned);
    }

    saveAxisOverrides();
    resetRigPose();
    return getAxisPreset(model);
  }

  function sanitizeModelUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";

    try {
      const url = new URL(raw, window.location.href);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      if (!url.pathname.toLowerCase().endsWith(".glb")) return "";
      return url.href;
    } catch (error) {
      return "";
    }
  }

  function resolveRemoteModelAsset() {
    const rpmId = String(params.get("rpm") || "").trim();
    if (/^[a-zA-Z0-9_-]{8,80}$/.test(rpmId)) {
      const url = `https://models.readyplayer.me/${rpmId}.glb?pose=T&quality=medium&textureAtlas=512`;
      localStorage.setItem(MODEL_URL_STORAGE_KEY, url);
      return url;
    }

    const fromQuery = sanitizeModelUrl(params.get("modelUrl"));
    if (fromQuery) {
      localStorage.setItem(MODEL_URL_STORAGE_KEY, fromQuery);
      return fromQuery;
    }

    return sanitizeModelUrl(localStorage.getItem(MODEL_URL_STORAGE_KEY));
  }

  function resolveLocalModelAsset() {
    const key = normalizeModelKey(getUserGender());
    return LOCAL_MODEL_ASSETS[key] || LOCAL_MODEL_ASSETS.male;
  }

  function applyCharacterModel() {
    if (!characterModel) return;
    const remoteModel = resolveRemoteModelAsset();
    const localModel = resolveLocalModelAsset();
    const model = remoteModel || localModel.src;
    currentModelScale = remoteModel ? "1.08 1.08 1.08" : localModel.scale;
    if (currentModelAsset === model) {
      characterModel.setAttribute("scale", currentModelScale);
      return;
    }
    currentModelAsset = model;
    rigBones = {};
    rigBaseRotations = {};
    rigBaseQuaternions = {};
    rigSegments = {};
    lastRigCacheSignature = "";
    characterModel.removeAttribute("gltf-model");
    characterModel.setAttribute("scale", currentModelScale);
    characterModel.setAttribute("gltf-model", model);
    scheduleRigCache();
  }

  function getThree() {
    return window.THREE || (window.AFRAME && window.AFRAME.THREE) || null;
  }

  function normalizeBoneName(name) {
    return String(name || "")
      .replace(/^.*:/, "")
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase();
  }

  function findBoneByAlias(byName, byNormalizedName, aliases) {
    for (const alias of aliases) {
      const exact = byName.get(alias);
      if (exact) return exact;

      const normalized = byNormalizedName.get(normalizeBoneName(alias));
      if (normalized) return normalized;
    }

    return null;
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
    const byNormalizedName = new Map();
    for (const bone of allBones) {
      const normalized = normalizeBoneName(bone.name);
      if (normalized && !byNormalizedName.has(normalized)) byNormalizedName.set(normalized, bone);
    }
    const nextBones = {};
    const nextBase = {};
    const nextQuaternions = {};

    for (const [key, aliases] of Object.entries(BONE_ALIASES)) {
      const bone = findBoneByAlias(byName, byNormalizedName, aliases);
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
    const foundBones = Object.keys(rigBones).sort();
    const signature = `${currentModelAsset}:${foundBones.join(",")}`;
    if (foundBones.length > 0 && signature !== lastRigCacheSignature) {
      lastRigCacheSignature = signature;
      console.info("[Corpus VR] Rig encontrado", {
        model: currentModelAsset,
        bones: foundBones,
        segments: Object.keys(rigSegments).sort()
      });
    }
    return foundBones.length;
  }

  function buildRigSegments(THREE) {
    const pairs = {
      spine: "chest",
      chest: "neck",
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
        targetWorldDir: new THREE.Vector3(),
        targetParentDir: new THREE.Vector3(),
        rootWorldQuat: new THREE.Quaternion(),
        parentWorldQuat: new THREE.Quaternion(),
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

  function rotateBoneMapped(name, x = 0, y = 0, z = 0, amount = 0.5, options = {}) {
    const axis = getSegmentAxis(name);
    rotateBone(
      name,
      x * toFiniteNumber(axis.rotX, 1),
      y * toFiniteNumber(axis.rotY, 1),
      z * toFiniteNumber(axis.rotZ, 1),
      options.usePresetAmount === false ? amount : toFiniteNumber(axis.amount, amount)
    );
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

  function vectorFromPosePoints(from, to, axis = {}) {
    const THREE = getThree();
    if (!THREE || !from || !to) return null;
    const rigSpace = from.space === "rig" && to.space === "rig";
    const dx = to.x - from.x;
    const dy = rigSpace ? to.y - from.y : from.y - to.y;
    const dz = rigSpace ? (to.z || 0) - (from.z || 0) : (from.z || 0) - (to.z || 0);
    const vector = new THREE.Vector3(
      dx * toFiniteNumber(axis.x, 1) * toFiniteNumber(axis.xScale, 1),
      dy * toFiniteNumber(axis.y, 1) * toFiniteNumber(axis.yScale, 1.25),
      dz * toFiniteNumber(axis.z, 1) * toFiniteNumber(axis.zScale, 0.85)
    );
    if (!Number.isFinite(vector.lengthSq()) || vector.lengthSq() < 0.0001) return null;
    return vector.normalize();
  }

  function getRigRootObject() {
    return avatar && avatar.object3D
      ? avatar.object3D
      : (characterModel && characterModel.object3D ? characterModel.object3D : null);
  }

  function directionToBoneParentSpace(segment, localDirection) {
    if (!segment || !localDirection) return null;

    const root = getRigRootObject();
    if (root) {
      root.updateMatrixWorld(true);
      root.getWorldQuaternion(segment.rootWorldQuat);
      segment.targetWorldDir.copy(localDirection).applyQuaternion(segment.rootWorldQuat).normalize();
    } else {
      segment.targetWorldDir.copy(localDirection).normalize();
    }

    const parent = segment.bone && segment.bone.parent;
    if (parent) {
      parent.updateMatrixWorld(true);
      parent.getWorldQuaternion(segment.parentWorldQuat).invert();
      segment.targetParentDir.copy(segment.targetWorldDir).applyQuaternion(segment.parentWorldQuat).normalize();
      return segment.targetParentDir;
    }

    return segment.targetWorldDir;
  }

  function aimSegment(name, from, to, amount = 0.82) {
    const segment = rigSegments[name];
    if (!segment || !landmarkOk(from, 0.3) || !landmarkOk(to, 0.3)) return false;

    const axis = getSegmentAxis(name);
    const target = vectorFromPosePoints(from, to, axis);
    if (!target) return false;

    const parentTarget = directionToBoneParentSpace(segment, target);
    if (!parentTarget) return false;

    segment.targetDir.copy(parentTarget);
    segment.deltaQuat.setFromUnitVectors(segment.restParentDir, segment.targetDir);
    segment.targetQuat.copy(segment.deltaQuat).multiply(segment.baseQuat);
    segment.bone.quaternion.slerp(segment.targetQuat, toFiniteNumber(axis.amount, amount));
    segment.bone.updateMatrix();
    segment.bone.updateMatrixWorld(true);
    return true;
  }

  function landmarkOk(point, threshold = 0.45) {
    return finitePoint(point) && (point.visibility == null || point.visibility > threshold);
  }

  function sanitizeLandmarkPoint(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    const z = Number.isFinite(point.z) ? point.z : 0;
    const visibility = Number.isFinite(point.visibility) ? clamp(point.visibility, 0, 1) : 1;
    return {
      ...point,
      x: clamp(point.x, -0.5, 1.5),
      y: clamp(point.y, -0.5, 1.5),
      z,
      visibility
    };
  }

  function sanitizeLandmarkSet(landmarks) {
    if (!Array.isArray(landmarks)) return null;
    return landmarks.map(sanitizeLandmarkPoint);
  }

  function finiteTextNumber(value, fallback = 0, digits = 2) {
    const number = Number.isFinite(value) ? value : fallback;
    return number.toFixed(digits);
  }

  function setAFrameVec3(element, attribute, x, y, z, fallback = [0, 0, 0], digits = 2) {
    if (!element) return;
    const fx = Number.isFinite(x) ? x : fallback[0];
    const fy = Number.isFinite(y) ? y : fallback[1];
    const fz = Number.isFinite(z) ? z : fallback[2];
    element.setAttribute(attribute, `${fx.toFixed(digits)} ${fy.toFixed(digits)} ${fz.toFixed(digits)}`);
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
          delegate: POSE_DELEGATE
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.52,
        minPosePresenceConfidence: 0.52,
        minTrackingConfidence: 0.50
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
    await new Promise((resolve) => {
      if (video.readyState >= 1 && video.videoWidth) return resolve();
      video.addEventListener("loadedmetadata", resolve, { once: true });
    });
    await video.play();
    updateCanvasSize();
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
    smoothedWorldLandmarks = null;
    stableRegistrationFrames = 0;
    calibrationSamples = [];
    autoCalibrated = false;
    neutralFrames = 0;
    resetJumpTracker();

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

  function updateCanvasSize() {
    if (!video.videoWidth || !video.videoHeight) return;
    const targetWidth = Math.max(320, Math.min(640, video.videoWidth));
    const targetHeight = Math.round(targetWidth * (video.videoHeight / video.videoWidth));
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
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
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
      ctx.stroke();
    }

    for (const index of FULL_BODY_POINTS) {
      const point = landmarks[index];
      if (!landmarkOk(point)) continue;
      ctx.beginPath();
      ctx.arc(point.x * canvas.width, point.y * canvas.height, index === 0 ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function smoothLandmarkSet(landmarks, previousSet) {
    const clean = sanitizeLandmarkSet(landmarks);
    if (!Array.isArray(clean)) return null;
    if (!previousSet || previousSet.length !== clean.length) {
      return clean.map((point) => point ? ({ ...point }) : null);
    }

    const nextSet = previousSet.slice();
    for (let index = 0; index < clean.length; index += 1) {
      const next = clean[index];
      const previous = previousSet[index];
      if (!next) {
        nextSet[index] = previous && finitePoint(previous) ? { ...previous, visibility: Math.max(0, (previous.visibility || 0) - 0.08) } : null;
        continue;
      }
      if (!previous || !finitePoint(previous)) {
        nextSet[index] = { ...next };
        continue;
      }
      const visibility = next.visibility == null ? 1 : next.visibility;
      const adaptive = visibility > 0.75 ? SMOOTHING : SMOOTHING * 0.45;
      nextSet[index] = {
        ...next,
        x: lerp(previous.x, next.x, adaptive),
        y: lerp(previous.y, next.y, adaptive),
        z: lerp(previous.z || 0, next.z || 0, adaptive),
        visibility
      };
    }

    return nextSet;
  }

  function smoothLandmarks(landmarks) {
    smoothedLandmarks = smoothLandmarkSet(landmarks, smoothedLandmarks);
    return smoothedLandmarks;
  }

  function smoothWorldLandmarks(landmarks) {
    smoothedWorldLandmarks = smoothLandmarkSet(landmarks, smoothedWorldLandmarks);
    return smoothedWorldLandmarks;
  }

  function mirrorLandmarks(landmarks) {
    if (!MIRROR_CAMERA || !Array.isArray(landmarks)) return landmarks;
    return landmarks.map((point) => point ? { ...point, x: 1 - point.x } : point);
  }

  function mirrorWorldLandmarks(landmarks) {
    if (!MIRROR_CAMERA || !Array.isArray(landmarks)) return landmarks;
    return landmarks.map((point) => point ? { ...point, x: -point.x } : point);
  }

  function pointPayload(point) {
    if (!point) return null;
    const payload = {
      x: Number(point.x.toFixed(4)),
      y: Number(point.y.toFixed(4)),
      z: Number((point.z || 0).toFixed(4)),
      visibility: point.visibility == null ? 1 : Number(point.visibility.toFixed(3))
    };
    if (point.space) payload.space = point.space;
    if (point.source) payload.source = point.source;
    return payload;
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
      hipCenter: pointPayload(features.hipCenter),
      rig: features.rig
    };
  }

  function finitePoint(point) {
    return point
      && Number.isFinite(point.x)
      && Number.isFinite(point.y)
      && (point.z == null || Number.isFinite(point.z));
  }

  function resolveWorldRigTransform(landmarks, worldLandmarks) {
    if (!Array.isArray(landmarks) || !Array.isArray(worldLandmarks)) return null;

    const screenLeftShoulder = landmarks[11];
    const screenRightShoulder = landmarks[12];
    const worldNose = worldLandmarks[0];
    const worldLeftShoulder = worldLandmarks[11];
    const worldRightShoulder = worldLandmarks[12];
    const worldLeftHip = worldLandmarks[23];
    const worldRightHip = worldLandmarks[24];
    if (![screenLeftShoulder, screenRightShoulder, worldNose, worldLeftShoulder, worldRightShoulder, worldLeftHip, worldRightHip].every(finitePoint)) {
      return null;
    }

    const screenShoulderDx = screenLeftShoulder.x - screenRightShoulder.x;
    const worldShoulderDx = worldLeftShoulder.x - worldRightShoulder.x;
    const hipY = (worldLeftHip.y + worldRightHip.y) / 2;

    return {
      xSign: Math.sign(screenShoulderDx || 1) === Math.sign(worldShoulderDx || 1) ? 1 : -1,
      ySign: worldNose.y >= hipY ? 1 : -1,
      zSign: -1
    };
  }

  function makeRigPoint(screenPoint, worldPoint, transform = null) {
    if (!screenPoint) return null;
    if (transform && finitePoint(worldPoint)) {
      return {
        space: "rig",
        source: "world",
        x: worldPoint.x * transform.xSign,
        y: worldPoint.y * transform.ySign,
        z: worldPoint.z * transform.zSign,
        visibility: screenPoint.visibility == null ? 1 : screenPoint.visibility
      };
    }

    const worldZ = worldPoint && Number.isFinite(worldPoint.z) ? -worldPoint.z : -(screenPoint.z || 0);
    return {
      space: "rig",
      source: "screen",
      x: screenPoint.x - 0.5,
      y: 0.5 - screenPoint.y,
      z: worldZ,
      visibility: screenPoint.visibility == null ? 1 : screenPoint.visibility
    };
  }

  function readPoseFeatures(landmarks, worldLandmarks = null) {
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

    const worldTransform = resolveWorldRigTransform(landmarks, worldLandmarks);
    const rig = {
      nose: makeRigPoint(nose, worldLandmarks && worldLandmarks[0], worldTransform),
      leftShoulder: makeRigPoint(leftShoulder, worldLandmarks && worldLandmarks[11], worldTransform),
      rightShoulder: makeRigPoint(rightShoulder, worldLandmarks && worldLandmarks[12], worldTransform),
      leftElbow: makeRigPoint(leftElbow, worldLandmarks && worldLandmarks[13], worldTransform),
      rightElbow: makeRigPoint(rightElbow, worldLandmarks && worldLandmarks[14], worldTransform),
      leftWrist: makeRigPoint(leftWrist, worldLandmarks && worldLandmarks[15], worldTransform),
      rightWrist: makeRigPoint(rightWrist, worldLandmarks && worldLandmarks[16], worldTransform),
      leftHip: makeRigPoint(leftHip, worldLandmarks && worldLandmarks[23], worldTransform),
      rightHip: makeRigPoint(rightHip, worldLandmarks && worldLandmarks[24], worldTransform),
      leftKnee: makeRigPoint(leftKnee, worldLandmarks && worldLandmarks[25], worldTransform),
      rightKnee: makeRigPoint(rightKnee, worldLandmarks && worldLandmarks[26], worldTransform),
      leftAnkle: makeRigPoint(leftAnkle, worldLandmarks && worldLandmarks[27], worldTransform),
      rightAnkle: makeRigPoint(rightAnkle, worldLandmarks && worldLandmarks[28], worldTransform)
    };

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
      rig,
      rigSource: worldTransform ? "world" : "screen",
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

  function baselineFromFeatures(features) {
    if (!features || !finitePoint(features.bodyCenter) || !finitePoint(features.shoulderCenter)) return null;
    return {
      centerX: features.bodyCenter.x,
      shoulderY: features.shoulderCenter.y,
      shoulderWidth: features.shoulderWidth,
      noseZ: features.noseZ,
      bodyHeight: features.bodyHeight,
      stanceWidth: features.stanceWidth
    };
  }

  function averageBaseline(samples) {
    if (!samples.length) return null;
    const keys = ["centerX", "shoulderY", "shoulderWidth", "noseZ", "bodyHeight", "stanceWidth"];
    const output = {};
    for (const key of keys) {
      const values = samples.map((sample) => sample[key]).filter(Number.isFinite);
      if (!values.length) return null;
      output[key] = values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    return output;
  }

  function captureBaseline(features, silent = false) {
    const sample = baselineFromFeatures(features);
    if (!sample) return false;
    baseline = sample;
    calibrationSamples = [];
    autoCalibrated = true;
    neutralFrames = 0;
    resetJumpTracker();
    if (!silent) setHint("calibrado automaticamente");
    return true;
  }

  function resetJumpTracker() {
    jumpTracker = {
      lastY: null,
      lastTime: 0,
      preloadAt: 0,
      airborne: false
    };
  }

  function detectPhysicalJump(features, duckDelta) {
    const now = performance.now();
    const currentY = features.shoulderCenter.y;
    const previousY = jumpTracker.lastY;
    const elapsed = jumpTracker.lastTime ? Math.max(16, now - jumpTracker.lastTime) : 16;
    const liftVelocity = previousY == null ? 0 : (previousY - currentY) / (elapsed / 16.67);

    jumpTracker.lastY = currentY;
    jumpTracker.lastTime = now;

    if (duckDelta > JUMP_PRELOAD_DROP) {
      jumpTracker.preloadAt = now;
      if (jumpTracker.airborne && duckDelta > -JUMP_LAND_RESET) {
        jumpTracker.airborne = false;
      }
      return false;
    }

    if (jumpTracker.airborne) {
      if (Math.abs(duckDelta) < JUMP_LAND_RESET) {
        jumpTracker.airborne = false;
      }
      return false;
    }

    const hadPreload = jumpTracker.preloadAt > 0 && now - jumpTracker.preloadAt <= JUMP_PRELOAD_WINDOW_MS;
    const liftedEnough = duckDelta < -JUMP_LIFT_THRESHOLD;
    const movingUpFast = liftVelocity > JUMP_VELOCITY_THRESHOLD;
    const kneesAreNotCrouched = features.kneeCenterY - features.hipCenter.y >= 0.16;

    if (hadPreload && liftedEnough && movingUpFast && kneesAreNotCrouched) {
      jumpTracker.airborne = true;
      jumpTracker.preloadAt = 0;
      return true;
    }

    return false;
  }

  function updateAutoCalibration(features) {
    if (!features) return false;
    const sample = baselineFromFeatures(features);
    if (!sample) return false;

    if (!baseline) {
      if (features.quality < MIN_CALIBRATION_QUALITY) {
        calibrationSamples = [];
        setHint(`auto calibragem: mostre corpo inteiro (${Math.round(features.quality * 100)}%)`);
        return false;
      }
      calibrationSamples.push(sample);
      if (calibrationSamples.length > AUTO_CALIBRATION_FRAMES) calibrationSamples.shift();
      const progress = Math.round((calibrationSamples.length / AUTO_CALIBRATION_FRAMES) * 100);
      setHint(`auto calibrando ${progress}% - fique parado de frente`);
      if (calibrationSamples.length >= AUTO_CALIBRATION_FRAMES) {
        baseline = averageBaseline(calibrationSamples);
        calibrationSamples = [];
        autoCalibrated = true;
        neutralFrames = 0;
        resetJumpTracker();
        setHint("auto calibrado - pode jogar");
        return true;
      }
      return false;
    }

    const lateral = Math.abs(features.bodyCenter.x - baseline.centerX);
    const vertical = Math.abs(features.shoulderCenter.y - baseline.shoulderY);
    const width = Math.abs(features.shoulderWidth - baseline.shoulderWidth);
    const neutral = features.quality >= MIN_CALIBRATION_QUALITY && lateral < 0.035 && vertical < 0.045 && width < 0.045;
    neutralFrames = neutral ? neutralFrames + 1 : 0;

    if (autoCalibrated && neutralFrames > AUTO_RECALIBRATION_FRAMES) {
      const fresh = baselineFromFeatures(features);
      if (fresh) {
        baseline.centerX = lerp(baseline.centerX, fresh.centerX, 0.08);
        baseline.shoulderY = lerp(baseline.shoulderY, fresh.shoulderY, 0.08);
        baseline.shoulderWidth = lerp(baseline.shoulderWidth, fresh.shoulderWidth, 0.08);
        baseline.noseZ = lerp(baseline.noseZ, fresh.noseZ, 0.08);
        baseline.bodyHeight = lerp(baseline.bodyHeight, fresh.bodyHeight, 0.08);
        baseline.stanceWidth = lerp(baseline.stanceWidth, fresh.stanceWidth, 0.08);
        neutralFrames = 0;
        resetJumpTracker();
      }
    }

    return true;
  }

  function chooseAction(features) {
    if (!updateAutoCalibration(features)) return null;
    if (!baseline) return null;

    const invert = Boolean(invertInput && invertInput.checked);
    const lateral = features.bodyCenter.x - baseline.centerX;
    const duckDelta = features.shoulderCenter.y - baseline.shoulderY;
    const widthDelta = features.shoulderWidth - baseline.shoulderWidth;
    const depthDelta = features.noseZ - baseline.noseZ;
    const lean = features.shoulderTilt;
    const stanceDelta = features.stanceWidth - baseline.stanceWidth;

    if (!(typeof isJumpDisabled === "function" && isJumpDisabled()) && detectPhysicalJump(features, duckDelta)) return "jump";
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

  function rotateBoneDirect(name, x = 0, y = 0, z = 0, amount = 0.5) {
    rotateBoneMapped(name, x, y, z, amount, { usePresetAmount: false });
  }

  function applyVisibleRigFallback(features, aimed = {}) {
    const leftUpperArm = clamp(normalizeAngle(features.upperArmAngleL - Math.PI / 2), -1.55, 1.55);
    const rightUpperArm = clamp(normalizeAngle(features.upperArmAngleR - Math.PI / 2), -1.55, 1.55);
    const leftLowerArm = clamp(normalizeAngle(features.lowerArmAngleL - Math.PI / 2), -1.65, 1.65);
    const rightLowerArm = clamp(normalizeAngle(features.lowerArmAngleR - Math.PI / 2), -1.65, 1.65);
    const leftUpperLeg = clamp(normalizeAngle(features.upperLegAngleL - Math.PI / 2), -1.0, 1.0);
    const rightUpperLeg = clamp(normalizeAngle(features.upperLegAngleR - Math.PI / 2), -1.0, 1.0);
    const leftLowerLeg = clamp(normalizeAngle(features.lowerLegAngleL - Math.PI / 2), -1.05, 1.05);
    const rightLowerLeg = clamp(normalizeAngle(features.lowerLegAngleR - Math.PI / 2), -1.05, 1.05);

    const leftArmLift = landmarkOk(features.leftWrist) && landmarkOk(features.leftShoulder)
      ? clamp((features.leftShoulder.y - features.leftWrist.y) * 3.0, -0.85, 1.65)
      : 0;
    const rightArmLift = landmarkOk(features.rightWrist) && landmarkOk(features.rightShoulder)
      ? clamp((features.rightShoulder.y - features.rightWrist.y) * 3.0, -0.85, 1.65)
      : 0;
    const leftArmReach = landmarkOk(features.leftWrist) && landmarkOk(features.leftShoulder)
      ? clamp((features.leftWrist.x - features.leftShoulder.x) * 2.5, -1.25, 1.25)
      : 0;
    const rightArmReach = landmarkOk(features.rightWrist) && landmarkOk(features.rightShoulder)
      ? clamp((features.rightWrist.x - features.rightShoulder.x) * 2.5, -1.25, 1.25)
      : 0;

    if (!aimed.upperArmL) rotateBoneDirect("upperArmL", -leftArmLift * 0.55, leftArmReach * 0.18, leftUpperArm, 0.52);
    if (!aimed.lowerArmL) rotateBoneDirect("lowerArmL", -leftArmLift * 0.22, 0, leftLowerArm, 0.56);
    if (!aimed.lowerArmL) rotateBoneDirect("wristL", leftLowerArm * 0.22, 0, leftLowerArm * 0.5, 0.5);

    if (!aimed.upperArmR) rotateBoneDirect("upperArmR", -rightArmLift * 0.55, rightArmReach * 0.18, rightUpperArm, 0.52);
    if (!aimed.lowerArmR) rotateBoneDirect("lowerArmR", -rightArmLift * 0.22, 0, rightLowerArm, 0.56);
    if (!aimed.lowerArmR) rotateBoneDirect("wristR", rightLowerArm * 0.22, 0, rightLowerArm * 0.5, 0.5);

    if (!aimed.upperLegL) rotateBoneDirect("upperLegL", leftLowerLeg * 0.36, leftUpperLeg * 0.12, leftUpperLeg * 0.26, 0.44);
    if (!aimed.lowerLegL) rotateBoneDirect("lowerLegL", leftLowerLeg * 0.62, 0, leftLowerLeg * 0.18, 0.48);
    if (!aimed.lowerLegL) rotateBoneDirect("footL", leftLowerLeg * 0.28, 0, 0, 0.42);

    if (!aimed.upperLegR) rotateBoneDirect("upperLegR", rightLowerLeg * 0.36, rightUpperLeg * 0.12, rightUpperLeg * 0.26, 0.44);
    if (!aimed.lowerLegR) rotateBoneDirect("lowerLegR", rightLowerLeg * 0.62, 0, rightLowerLeg * 0.18, 0.48);
    if (!aimed.lowerLegR) rotateBoneDirect("footR", rightLowerLeg * 0.28, 0, 0, 0.42);
  }

  function rotateLimbBones(features) {
    if (!rigBones.head && characterModel) cacheRigBones();
    if (!Object.keys(rigBones).length) return;

    const shoulderTilt = degToRad(features.shoulderTilt);
    const hipTilt = degToRad(features.hipTilt);
    const yaw = clamp(features.shoulderTwist * 1.8, -0.45, 0.45);
    const headYaw = clamp(features.headOffsetX * 2.4, -0.55, 0.55);
    const torsoCrouch = baseline ? clamp((features.shoulderCenter.y - baseline.shoulderY) * 2.8, 0, 0.38) : 0;

    rotateBoneMapped("hips", torsoCrouch, yaw * 0.25, -hipTilt * 0.45, 0.42);
    rotateBoneMapped("spine", torsoCrouch * 0.26, yaw * 0.24, -shoulderTilt * 0.22, 0.4);
    rotateBoneMapped("chest", -torsoCrouch * 0.16, yaw * 0.38, -shoulderTilt * 0.32, 0.45);
    rotateBoneMapped("neck", 0, headYaw * 0.45, -shoulderTilt * 0.35, 0.48);
    rotateBoneMapped("head", 0, headYaw, -shoulderTilt * 0.58, 0.54);
    rotateBoneMapped("shoulderL", 0, 0, -shoulderTilt * 0.35, 0.44);
    rotateBoneMapped("shoulderR", 0, 0, -shoulderTilt * 0.35, 0.44);

    const rig = features.rig || features;
    const aimed = {
      upperArmL: aimSegment("upperArmL", rig.leftShoulder, rig.leftElbow, 0.92),
      lowerArmL: aimSegment("lowerArmL", rig.leftElbow, rig.leftWrist, 0.92),
      upperArmR: aimSegment("upperArmR", rig.rightShoulder, rig.rightElbow, 0.92),
      lowerArmR: aimSegment("lowerArmR", rig.rightElbow, rig.rightWrist, 0.92),
      upperLegL: aimSegment("upperLegL", rig.leftHip, rig.leftKnee, 0.78),
      lowerLegL: aimSegment("lowerLegL", rig.leftKnee, rig.leftAnkle, 0.78),
      upperLegR: aimSegment("upperLegR", rig.rightHip, rig.rightKnee, 0.78),
      lowerLegR: aimSegment("lowerLegR", rig.rightKnee, rig.rightAnkle, 0.78)
    };

    const leftLowerArm = clamp(normalizeAngle(features.lowerArmAngleL - Math.PI / 2), -1.45, 1.45);
    const rightLowerArm = clamp(normalizeAngle(features.lowerArmAngleR - Math.PI / 2), -1.45, 1.45);
    const leftLowerLeg = clamp(normalizeAngle(features.lowerLegAngleL - Math.PI / 2), -0.95, 0.95);
    const rightLowerLeg = clamp(normalizeAngle(features.lowerLegAngleR - Math.PI / 2), -0.95, 0.95);

    applyVisibleRigFallback(features, aimed);

    if (!aimed.upperArmL) rotateBoneMapped("upperArmL", 0, 0, clamp(normalizeAngle(features.upperArmAngleL - Math.PI / 2), -1.25, 1.25), 0.72);
    if (!aimed.lowerArmL) rotateBoneMapped("lowerArmL", 0, 0, leftLowerArm, 0.72);
    if (!aimed.upperArmR) rotateBoneMapped("upperArmR", 0, 0, clamp(normalizeAngle(features.upperArmAngleR - Math.PI / 2), -1.25, 1.25), 0.72);
    if (!aimed.lowerArmR) rotateBoneMapped("lowerArmR", 0, 0, rightLowerArm, 0.72);
    if (!aimed.upperLegL) rotateBoneMapped("upperLegL", leftLowerLeg * 0.35, 0, leftLowerLeg * 0.25, 0.58);
    if (!aimed.upperLegR) rotateBoneMapped("upperLegR", rightLowerLeg * 0.35, 0, rightLowerLeg * 0.25, 0.58);

    rotateBoneMapped("wristL", leftLowerArm * 0.18, 0, leftLowerArm * 0.45, 0.62);
    rotateBoneMapped("wristR", rightLowerArm * 0.18, 0, rightLowerArm * 0.45, 0.62);
    rotateBoneMapped("footL", leftLowerLeg * 0.28, 0, 0, 0.5);
    rotateBoneMapped("footR", rightLowerLeg * 0.28, 0, 0, 0.5);

    if (characterModel) characterModel.object3D.updateMatrixWorld(true);
  }

  function updateAvatar(features, options = {}) {
    if (!avatar || !features) return;
    avatar.setAttribute("visible", "true");

    const lateral = baseline && !options.remote ? (features.bodyCenter.x - baseline.centerX) : (features.bodyCenter.x - 0.5);
    const crouch = baseline && !options.remote ? Math.max(0, features.shoulderCenter.y - baseline.shoulderY) : 0;
    const avatarX = clamp(lateral * 2.35, -0.8, 0.8);
    const avatarY = clamp(-crouch * 1.25, -0.26, 0.08);
    const yaw = clamp(features.shoulderTwist * 120, -24, 24);
    const roll = clamp(features.shoulderTilt * 0.35, -10, 10);

    setAFrameVec3(avatar, "position", avatarX, avatarY, -3.2);
    setAFrameVec3(avatar, "rotation", 0, yaw, 0, [0, 0, 0], 1);

    if (characterModel) {
      setAFrameVec3(characterModel, "rotation", 0, 0, roll, [0, 0, 0], 1);
      characterModel.setAttribute("scale", currentModelScale);
    }

    rotateLimbBones(features);

    setAFrameVec3(avatarTorso, "rotation", 0, 0, features.shoulderTilt, [0, 0, 0], 1);
    setAFrameVec3(avatarShoulders, "rotation", 0, 0, 90 + features.shoulderTilt, [0, 0, 90], 1);
    setAFrameVec3(avatarHips, "rotation", 0, 0, 90 + features.hipTilt, [0, 0, 90], 1);
    setAFrameVec3(avatarHead, "position", features.headOffsetX * 1.8, 0.72, 0);

    if (avatarLeftHand && landmarkOk(features.leftWrist)) {
      setAFrameVec3(avatarLeftHand, "position", (features.leftWrist.x - 0.5) * 1.4, (0.55 - features.leftWrist.y) * 1.25, 0);
    }
    if (avatarRightHand && landmarkOk(features.rightWrist)) {
      setAFrameVec3(avatarRightHand, "position", (features.rightWrist.x - 0.5) * 1.4, (0.55 - features.rightWrist.y) * 1.25, 0);
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
    const sourceLabel = features && features.rigSource ? `/${features.rigSource}` : "";
    const rigLabel = Object.keys(rigBones).length ? `rig ok${sourceLabel}` : "rig aguardando";
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
    return readPoseFeatures(mirrorLandmarks(createDebugLandmarks(raised)));
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
      model: getUserGender(),
      boneCount: Object.keys(rigBones).length,
      segmentCount: Object.keys(rigSegments).length,
      axis: getAxisPreset(),
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

    updateCanvasSize();
    if (!video.videoWidth || !video.videoHeight || !poseLandmarker) {
      drawSimulationFrame();
      rafId = requestAnimationFrame(frame);
      return;
    }

    drawSimulationFrame();

    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      let result = null;
      try {
        result = poseLandmarker.detectForVideo(video, performance.now());
      } catch (error) {
        const now = performance.now();
        if (now - lastVisionErrorAt > 1200) {
          console.warn("[Corpus VR] MediaPipe detectForVideo falhou", error);
          setHint("visao computacional instavel - tentando novamente");
          lastVisionErrorAt = now;
        }
      }
      const rawLandmarks = result && result.landmarks && result.landmarks[0];
      const rawWorldLandmarks = result && result.worldLandmarks && result.worldLandmarks[0];
      const landmarks = smoothLandmarks(mirrorLandmarks(rawLandmarks));
      const worldLandmarks = smoothWorldLandmarks(mirrorWorldLandmarks(rawWorldLandmarks));

      if (landmarks) {
        drawSimulationFrame(landmarks);
        const features = readPoseFeatures(landmarks, worldLandmarks);
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
      setHint("auto calibragem: fique parado de frente com corpo inteiro no quadro");
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
      calibrationSamples = [];
      autoCalibrated = false;
      neutralFrames = 0;
      resetJumpTracker();
      setHint("auto calibragem reiniciada: fique parado de frente");
    });
  }

  if (characterModel) {
    characterModel.addEventListener("model-loaded", () => {
      cacheRigBones();
      resetRigPose();
    });
    characterModel.addEventListener("model-error", (event) => {
      console.warn("[Corpus VR] Falha ao carregar avatar corporal", event && event.detail);
      setHint("modelo corporal indisponivel");
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
    model: () => currentModelAsset,
    asset: () => resolveLocalModelAsset(),
    clearModel: () => {
      localStorage.removeItem(MODEL_URL_STORAGE_KEY);
      currentModelAsset = "";
      applyCharacterModel();
      return currentModelAsset;
    },
    neutral: () => applyDebugPose(false),
    raised: () => applyDebugPose(true),
    axis: (model) => getAxisPreset(model),
    setAxis: (model, segment, config) => {
      if (segment && typeof segment === "object") {
        return setAxisOverride(getUserGender(), model, segment);
      }
      return setAxisOverride(model, segment, config);
    },
    resetAxis: (model) => {
      const key = normalizeModelKey(model || getUserGender());
      delete rigAxisOverrides[key];
      saveAxisOverrides();
      resetRigPose();
      return getAxisPreset(key);
    }
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
