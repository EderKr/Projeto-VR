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
  const poseVrStatusEl = document.getElementById("poseGameVRStatus");

  const avatar = document.getElementById("bodyMirrorAvatar");
  const characterModel = document.getElementById("bodyMirrorCharacterModel");
  const avatarTorso = document.getElementById("bodyMirrorTorso");
  const avatarHead = document.getElementById("bodyMirrorHead");
  const avatarShoulders = document.getElementById("bodyMirrorShoulders");
  const avatarHips = document.getElementById("bodyMirrorHips");
  const avatarLeftHand = document.getElementById("bodyMirrorLeftHand");
  const avatarRightHand = document.getElementById("bodyMirrorRightHand");

  if (!video || !canvas || !ctx || !toggleButton || !avatar || !characterModel) return;

  const params = new URLSearchParams(window.location.search);
  const MIRROR_CAMERA = true;
  const MEDIAPIPE_VERSION = "0.10.35";
  const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
  const MOTION_WIDTH = 96;
  const MOTION_HEIGHT = 54;
  const ACTION_COOLDOWN_MS = 520;

  const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28]
  ];

  const REQUIRED_POINTS = [0, 11, 12, 23, 24];
  const TRACKED_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

  const BONE_ALIASES = {
    hips: ["hips", "mixamorigHips"],
    spine: ["spine", "mixamorigSpine"],
    chest: ["spine1", "spine2", "chest", "upperChest", "mixamorigSpine1", "mixamorigSpine2"],
    head: ["head", "mixamorigHead"],
    upperArmL: ["leftArm", "leftUpperArm", "upperArm_L", "upperArm.L", "mixamorigLeftArm"],
    lowerArmL: ["leftForeArm", "leftLowerArm", "lowerArm_L", "lowerArm.L", "mixamorigLeftForeArm"],
    wristL: ["leftHand", "wrist_L", "wrist.L", "mixamorigLeftHand"],
    upperArmR: ["rightArm", "rightUpperArm", "upperArm_R", "upperArm.R", "mixamorigRightArm"],
    lowerArmR: ["rightForeArm", "rightLowerArm", "lowerArm_R", "lowerArm.R", "mixamorigRightForeArm"],
    wristR: ["rightHand", "wrist_R", "wrist.R", "mixamorigRightHand"],
    upperLegL: ["leftUpLeg", "leftUpperLeg", "upperLeg_L", "upperLeg.L", "mixamorigLeftUpLeg"],
    lowerLegL: ["leftLeg", "leftLowerLeg", "lowerLeg_L", "lowerLeg.L", "mixamorigLeftLeg"],
    footL: ["leftFoot", "foot_L", "foot.L", "mixamorigLeftFoot"],
    upperLegR: ["rightUpLeg", "rightUpperLeg", "upperLeg_R", "upperLeg.R", "mixamorigRightUpLeg"],
    lowerLegR: ["rightLeg", "rightLowerLeg", "lowerLeg_R", "lowerLeg.R", "mixamorigRightLeg"],
    footR: ["rightFoot", "foot_R", "foot.R", "mixamorigRightFoot"]
  };

  let enabled = false;
  let stream = null;
  let rafId = 0;
  let poseLandmarker = null;
  let poseLoading = false;
  let poseUnavailable = false;
  let lastVideoTime = -1;
  let baseline = null;
  let lastActionAt = 0;
  let lastPoseAt = 0;
  let currentModel = "";
  let bones = {};
  let baseRotations = {};
  let motionPrevious = null;
  let motionCenter = { x: 0.5, y: 0.5 };
  let motionEnergy = 0;

  const motionCanvas = document.createElement("canvas");
  motionCanvas.width = MOTION_WIDTH;
  motionCanvas.height = MOTION_HEIGHT;
  const motionCtx = motionCanvas.getContext("2d", { willReadFrequently: true });

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setHint(text) {
    if (hintEl) hintEl.textContent = text;
  }

  function setAction(text) {
    if (actionEl) actionEl.textContent = `acao: ${text || "--"}`;
  }

  function setButtonLabels() {
    toggleButton.textContent = enabled ? "Desativar" : "Ativar";
    if (poseVrStatusEl && typeof setCanvasText === "function") {
      setCanvasText(poseVrStatusEl, enabled ? "CORPO ATIVO" : "ATIVAR CORPO");
    }
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function finitePoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y);
  }

  function pointOk(point, minVisibility = 0.35) {
    return finitePoint(point) && (point.visibility == null || point.visibility >= minVisibility);
  }

  function setVec3(el, attr, x, y, z, digits = 3) {
    if (!el) return;
    el.setAttribute(attr, `${x.toFixed(digits)} ${y.toFixed(digits)} ${z.toFixed(digits)}`);
  }

  function normalizeName(name) {
    return String(name || "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  }

  function getGender() {
    const forced = String(params.get("gender") || "").toLowerCase();
    if (forced === "female" || forced === "feminino") return "female";
    if (forced === "male" || forced === "masculino") return "male";
    const user = window.authState && window.authState.user;
    return user && user.gender === "female" ? "female" : "male";
  }

  function applyCharacterModel() {
    const model = getGender() === "female" ? "#readyPlayerFemaleModel" : "#readyPlayerMaleModel";
    if (currentModel === model) return;
    currentModel = model;
    bones = {};
    baseRotations = {};
    characterModel.removeAttribute("gltf-model");
    characterModel.setAttribute("scale", "1.08 1.08 1.08");
    characterModel.setAttribute("gltf-model", model);
    window.setTimeout(cacheBones, 250);
  }

  function cacheBones() {
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

    const namedBones = allBones.map((bone) => ({
      bone,
      normalized: normalizeName(bone.name)
    }));
    const byName = new Map();
    for (const item of namedBones) byName.set(item.normalized, item.bone);

    const found = {};
    const bases = {};
    for (const [slot, aliases] of Object.entries(BONE_ALIASES)) {
      let bone = null;
      for (const alias of aliases) {
        const normalizedAlias = normalizeName(alias);
        bone = byName.get(normalizedAlias);
        if (!bone) {
          const flexible = namedBones.find((item) => (
            item.normalized.endsWith(normalizedAlias)
            || item.normalized.includes(normalizedAlias)
          ));
          bone = flexible && flexible.bone;
        }
        if (bone) break;
      }
      if (!bone) continue;
      found[slot] = bone;
      bases[slot] = {
        x: bone.rotation.x,
        y: bone.rotation.y,
        z: bone.rotation.z
      };
    }

    bones = found;
    baseRotations = bases;
    if (Object.keys(bones).length) {
      console.info("[Corpus VR] Novo controlador corporal: ossos encontrados", Object.keys(bones));
    }
    return Object.keys(bones).length;
  }

  function rotateBone(name, x = 0, y = 0, z = 0, amount = 0.45) {
    const bone = bones[name];
    const base = baseRotations[name];
    if (!bone || !base) return;
    bone.rotation.x = lerp(bone.rotation.x, base.x + x, amount);
    bone.rotation.y = lerp(bone.rotation.y, base.y + y, amount);
    bone.rotation.z = lerp(bone.rotation.z, base.z + z, amount);
    bone.updateMatrixWorld(true);
  }

  function resetPoseState() {
    baseline = null;
    lastVideoTime = -1;
    lastActionAt = 0;
    lastPoseAt = 0;
    motionPrevious = null;
    motionCenter = { x: 0.5, y: 0.5 };
    motionEnergy = 0;
  }

  function resetBones() {
    for (const [name, bone] of Object.entries(bones)) {
      const base = baseRotations[name];
      if (!bone || !base) continue;
      bone.rotation.set(base.x, base.y, base.z);
      bone.updateMatrixWorld(true);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia indisponivel");
    }

    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 960 },
        height: { ideal: 540 },
        facingMode: "user"
      }
    });

    video.srcObject = stream;
    await new Promise((resolve) => {
      if (video.readyState >= 1 && video.videoWidth) resolve();
      else video.addEventListener("loadedmetadata", resolve, { once: true });
    });
    await video.play();
  }

  async function ensurePoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    if (poseUnavailable) return null;
    if (poseLoading) {
      while (poseLoading && !poseLandmarker) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return poseLandmarker;
    }

    poseLoading = true;
    setStatus("carregando IA");

    try {
      const vision = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`);
      const resolver = await vision.FilesetResolver.forVisionTasks(
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
      );

      poseLandmarker = await vision.PoseLandmarker.createFromOptions(resolver, {
        baseOptions: {
          modelAssetPath: POSE_MODEL_URL,
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.35,
        minPosePresenceConfidence: 0.35,
        minTrackingConfidence: 0.35
      });

      return poseLandmarker;
    } catch (error) {
      console.warn("[Corpus VR] MediaPipe falhou; usando fallback por movimento.", error);
      poseUnavailable = true;
      return null;
    } finally {
      poseLoading = false;
    }
  }

  function updateCanvasSize() {
    if (!video.videoWidth || !video.videoHeight) return;
    const width = Math.max(320, Math.min(640, video.videoWidth));
    const height = Math.round(width * (video.videoHeight / video.videoWidth));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function drawFrame(landmarks) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    if (video.videoWidth && video.videoHeight) {
      ctx.save();
      if (MIRROR_CAMERA) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, 0, 0, width, height);
      ctx.restore();
      ctx.fillStyle = "rgba(7, 19, 31, 0.22)";
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = "#07131F";
      ctx.fillRect(0, 0, width, height);
    }

    ctx.strokeStyle = "rgba(255, 232, 182, 0.24)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    if (!Array.isArray(landmarks)) return;

    ctx.strokeStyle = "#F28C28";
    ctx.fillStyle = "#FFE8B6";
    ctx.lineWidth = 3;
    for (const [from, to] of POSE_CONNECTIONS) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!pointOk(a) || !pointOk(b)) continue;
      ctx.beginPath();
      ctx.moveTo(a.x * width, a.y * height);
      ctx.lineTo(b.x * width, b.y * height);
      ctx.stroke();
    }
    for (const index of TRACKED_POINTS) {
      const point = landmarks[index];
      if (!pointOk(point)) continue;
      ctx.beginPath();
      ctx.arc(point.x * width, point.y * height, index === 0 ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function mirrorLandmarks(landmarks) {
    if (!MIRROR_CAMERA || !Array.isArray(landmarks)) return landmarks;
    return landmarks.map((point) => point ? { ...point, x: 1 - point.x } : point);
  }

  function qualityOf(landmarks) {
    if (!Array.isArray(landmarks)) return 0;
    const visible = TRACKED_POINTS.filter((index) => pointOk(landmarks[index], 0.25)).length;
    return visible / TRACKED_POINTS.length;
  }

  function center(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: ((a.z || 0) + (b.z || 0)) / 2,
      visibility: Math.min(a.visibility == null ? 1 : a.visibility, b.visibility == null ? 1 : b.visibility)
    };
  }

  function angle(a, b) {
    if (!finitePoint(a) || !finitePoint(b)) return 0;
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function readPose(landmarks, source = "pose") {
    if (!Array.isArray(landmarks)) return null;
    for (const index of REQUIRED_POINTS) {
      if (!pointOk(landmarks[index], 0.25)) return null;
    }

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
    const shoulderCenter = center(leftShoulder, rightShoulder);
    const hipCenter = center(leftHip, rightHip);
    const bodyCenter = center(shoulderCenter, hipCenter);
    const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
    const stanceWidth = pointOk(leftAnkle, 0.2) && pointOk(rightAnkle, 0.2)
      ? Math.abs(rightAnkle.x - leftAnkle.x)
      : shoulderWidth;
    const kneeCenterY = pointOk(leftKnee, 0.2) && pointOk(rightKnee, 0.2)
      ? (leftKnee.y + rightKnee.y) / 2
      : hipCenter.y + 0.2;

    return {
      source,
      landmarks,
      quality: qualityOf(landmarks),
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
      shoulderCenter,
      hipCenter,
      bodyCenter,
      shoulderWidth,
      stanceWidth,
      kneeCenterY,
      shoulderTilt: angle(leftShoulder, rightShoulder),
      hipTilt: angle(leftHip, rightHip),
      upperArmL: angle(leftShoulder, leftElbow),
      lowerArmL: angle(leftElbow, leftWrist),
      upperArmR: angle(rightShoulder, rightElbow),
      lowerArmR: angle(rightElbow, rightWrist),
      upperLegL: angle(leftHip, leftKnee),
      lowerLegL: angle(leftKnee, leftAnkle),
      upperLegR: angle(rightHip, rightKnee),
      lowerLegR: angle(rightKnee, rightAnkle)
    };
  }

  function baselineFromPose(pose) {
    return {
      x: pose.bodyCenter.x,
      shoulderY: pose.shoulderCenter.y,
      hipY: pose.hipCenter.y,
      width: pose.shoulderWidth,
      stanceWidth: pose.stanceWidth,
      z: pose.nose.z || 0
    };
  }

  function ensureBaseline(pose) {
    if (baseline || !pose) return;
    baseline = baselineFromPose(pose);
    setHint("calibrado");
  }

  function makeMotionLandmarks() {
    if (!motionCtx || !video.videoWidth || !video.videoHeight) return null;

    motionCtx.save();
    if (MIRROR_CAMERA) {
      motionCtx.translate(MOTION_WIDTH, 0);
      motionCtx.scale(-1, 1);
    }
    motionCtx.drawImage(video, 0, 0, MOTION_WIDTH, MOTION_HEIGHT);
    motionCtx.restore();

    const image = motionCtx.getImageData(0, 0, MOTION_WIDTH, MOTION_HEIGHT);
    const data = image.data;
    const current = new Uint8Array(MOTION_WIDTH * MOTION_HEIGHT);
    let total = 0;
    let weightedX = 0;
    let weightedY = 0;

    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      const gray = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
      current[p] = gray;
      if (!motionPrevious) continue;
      const diff = Math.abs(gray - motionPrevious[p]);
      if (diff < 16) continue;
      const x = p % MOTION_WIDTH;
      const y = Math.floor(p / MOTION_WIDTH);
      total += diff;
      weightedX += diff * x;
      weightedY += diff * y;
    }

    motionPrevious = current;
    if (total > 0) {
      const nextX = weightedX / total / MOTION_WIDTH;
      const nextY = weightedY / total / MOTION_HEIGHT;
      motionCenter.x = lerp(motionCenter.x, nextX, 0.35);
      motionCenter.y = lerp(motionCenter.y, nextY, 0.35);
      motionEnergy = lerp(motionEnergy, clamp(total / (MOTION_WIDTH * MOTION_HEIGHT * 255) * 5, 0, 1), 0.35);
    } else {
      motionEnergy = lerp(motionEnergy, 0, 0.12);
    }

    const x = clamp(motionCenter.x, 0.25, 0.75);
    const y = clamp(motionCenter.y, 0.30, 0.72);
    const lift = motionEnergy * 0.16;
    const landmarks = [];
    landmarks[0] = { x, y: y - 0.28, z: -0.16, visibility: 0.8 };
    landmarks[11] = { x: x - 0.13, y: y - 0.10, z: -0.10, visibility: 0.8 };
    landmarks[12] = { x: x + 0.13, y: y - 0.10, z: -0.10, visibility: 0.8 };
    landmarks[13] = { x: x - 0.24, y: y + 0.05 - lift, z: -0.08, visibility: 0.75 };
    landmarks[14] = { x: x + 0.24, y: y + 0.05 - lift, z: -0.08, visibility: 0.75 };
    landmarks[15] = { x: x - 0.31, y: y + 0.18 - lift, z: -0.08, visibility: 0.75 };
    landmarks[16] = { x: x + 0.31, y: y + 0.18 - lift, z: -0.08, visibility: 0.75 };
    landmarks[23] = { x: x - 0.09, y: y + 0.23, z: -0.06, visibility: 0.8 };
    landmarks[24] = { x: x + 0.09, y: y + 0.23, z: -0.06, visibility: 0.8 };
    landmarks[25] = { x: x - 0.10, y: y + 0.40, z: -0.04, visibility: 0.7 };
    landmarks[26] = { x: x + 0.10, y: y + 0.40, z: -0.04, visibility: 0.7 };
    landmarks[27] = { x: x - 0.11, y: y + 0.55, z: -0.04, visibility: 0.7 };
    landmarks[28] = { x: x + 0.11, y: y + 0.55, z: -0.04, visibility: 0.7 };
    return landmarks;
  }

  function updateAvatar(pose) {
    if (!pose) return;
    ensureBaseline(pose);

    const bx = baseline ? baseline.x : 0.5;
    const by = baseline ? baseline.shoulderY : pose.shoulderCenter.y;
    const lateral = pose.bodyCenter.x - bx;
    const crouch = Math.max(0, pose.shoulderCenter.y - by);
    const avatarX = clamp(lateral * 2.6, -0.9, 0.9);
    const avatarY = clamp(-crouch * 1.5, -0.32, 0.12);
    const shoulderTilt = clamp((pose.rightShoulder.y - pose.leftShoulder.y) * 140, -22, 22);
    const hipTilt = clamp((pose.rightHip.y - pose.leftHip.y) * 100, -18, 18);
    const yaw = clamp((pose.rightShoulder.z || 0) - (pose.leftShoulder.z || 0), -0.25, 0.25) * 120;
    const headYaw = clamp((pose.nose.x - pose.shoulderCenter.x) * 2.2, -0.55, 0.55);

    avatar.setAttribute("visible", "true");
    setVec3(avatar, "position", avatarX, avatarY, -3.2);
    setVec3(avatar, "rotation", 0, yaw, 0, 2);
    setVec3(characterModel, "rotation", 0, 0, shoulderTilt, 2);

    if (!Object.keys(bones).length) cacheBones();
    rotateBone("hips", crouch * 1.4, yaw * 0.003, -hipTilt * Math.PI / 180 * 0.45);
    rotateBone("spine", crouch * 0.6, yaw * 0.004, -shoulderTilt * Math.PI / 180 * 0.28);
    rotateBone("chest", -crouch * 0.35, yaw * 0.006, -shoulderTilt * Math.PI / 180 * 0.35);
    rotateBone("head", 0, headYaw, -shoulderTilt * Math.PI / 180 * 0.55);

    rotateBone("upperArmL", 0, 0, clamp(pose.upperArmL - Math.PI / 2, -1.6, 1.6), 0.55);
    rotateBone("lowerArmL", 0, 0, clamp(pose.lowerArmL - Math.PI / 2, -1.6, 1.6), 0.55);
    rotateBone("wristL", 0, 0, clamp(pose.lowerArmL - Math.PI / 2, -1.2, 1.2), 0.45);
    rotateBone("upperArmR", 0, 0, clamp(pose.upperArmR - Math.PI / 2, -1.6, 1.6), 0.55);
    rotateBone("lowerArmR", 0, 0, clamp(pose.lowerArmR - Math.PI / 2, -1.6, 1.6), 0.55);
    rotateBone("wristR", 0, 0, clamp(pose.lowerArmR - Math.PI / 2, -1.2, 1.2), 0.45);
    rotateBone("upperLegL", clamp(pose.upperLegL - Math.PI / 2, -0.9, 0.9), 0, 0, 0.45);
    rotateBone("lowerLegL", clamp(pose.lowerLegL - Math.PI / 2, -1.0, 1.0), 0, 0, 0.45);
    rotateBone("footL", clamp(pose.lowerLegL - Math.PI / 2, -0.6, 0.6), 0, 0, 0.35);
    rotateBone("upperLegR", clamp(pose.upperLegR - Math.PI / 2, -0.9, 0.9), 0, 0, 0.45);
    rotateBone("lowerLegR", clamp(pose.lowerLegR - Math.PI / 2, -1.0, 1.0), 0, 0, 0.45);
    rotateBone("footR", clamp(pose.lowerLegR - Math.PI / 2, -0.6, 0.6), 0, 0, 0.35);

    if (avatarTorso) setVec3(avatarTorso, "rotation", 0, 0, shoulderTilt, 2);
    if (avatarHead) setVec3(avatarHead, "position", (pose.nose.x - pose.shoulderCenter.x) * 1.9, 0.72, 0, 2);
    if (avatarShoulders) setVec3(avatarShoulders, "rotation", 0, 0, 90 + shoulderTilt, 2);
    if (avatarHips) setVec3(avatarHips, "rotation", 0, 0, 90 + hipTilt, 2);
    if (avatarLeftHand && pointOk(pose.leftWrist, 0.2)) {
      setVec3(avatarLeftHand, "position", (pose.leftWrist.x - 0.5) * 1.45, (0.55 - pose.leftWrist.y) * 1.25, 0, 2);
    }
    if (avatarRightHand && pointOk(pose.rightWrist, 0.2)) {
      setVec3(avatarRightHand, "position", (pose.rightWrist.x - 0.5) * 1.45, (0.55 - pose.rightWrist.y) * 1.25, 0, 2);
    }

    characterModel.object3D.updateMatrixWorld(true);
  }

  function chooseAction(pose) {
    if (!baseline || !pose) return null;
    const invert = Boolean(invertInput && invertInput.checked);
    const lateral = pose.bodyCenter.x - baseline.x;
    const duckDelta = pose.shoulderCenter.y - baseline.shoulderY;
    const widthDelta = pose.shoulderWidth - baseline.width;
    const stanceDelta = pose.stanceWidth - baseline.stanceWidth;
    const zDelta = (pose.nose.z || 0) - baseline.z;
    const lean = (pose.rightShoulder.y - pose.leftShoulder.y);

    if (!(typeof isJumpDisabled === "function" && isJumpDisabled()) && duckDelta < -0.075 && pose.hipCenter.y < baseline.hipY - 0.045) return "jump";
    if (duckDelta > 0.070 || pose.kneeCenterY - pose.hipCenter.y < 0.18) return "duck";
    if (widthDelta > 0.065 || stanceDelta > 0.10 || zDelta < -0.10) return "attack";

    if (Math.abs(lateral) > 0.065 || Math.abs(lean) > 0.050) {
      const raw = lateral > 0 || lean > 0 ? "right" : "left";
      const direction = invert ? (raw === "right" ? "left" : "right") : raw;
      return direction === "left" ? "dodgeLeft" : "dodgeRight";
    }

    return null;
  }

  function dispatchAction(action, source) {
    if (!action || typeof window.dispatchGameAction !== "function") return;
    const state = typeof window.getGameInputState === "function"
      ? window.getGameInputState()
      : { running: false, waitingInput: false };
    if (!state.running || !state.waitingInput) return;

    const now = performance.now();
    if (now - lastActionAt < ACTION_COOLDOWN_MS) return;
    lastActionAt = now;
    setAction(action);
    window.dispatchGameAction(action, source);
  }

  function applyPose(pose) {
    if (!pose) return;
    updateAvatar(pose);
    const action = chooseAction(pose);
    dispatchAction(action, pose.source === "motion" ? "movimento corporal" : "visao corporal");
    if (!action) setAction("--");
    setHint(`${pose.source === "motion" ? "movimento" : "pose"} ${Math.round(pose.quality * 100)}% - ${Object.keys(bones).length ? "rig ok" : "rig procurando"}`);
  }

  function detectPoseFrame() {
    if (!poseLandmarker || !video.videoWidth || video.currentTime === lastVideoTime) return null;
    lastVideoTime = video.currentTime;
    const result = poseLandmarker.detectForVideo(video, performance.now());
    const landmarks = mirrorLandmarks(result && result.landmarks && result.landmarks[0]);
    if (!landmarks) return null;
    lastPoseAt = performance.now();
    drawFrame(landmarks);
    return readPose(landmarks, "pose");
  }

  function detectMotionFrame() {
    const landmarks = makeMotionLandmarks();
    drawFrame(landmarks);
    return readPose(landmarks, "motion");
  }

  function frame() {
    if (!enabled) return;
    updateCanvasSize();

    let pose = null;
    try {
      pose = detectPoseFrame();
    } catch (error) {
      console.warn("[Corpus VR] Falha em detectForVideo; alternando para movimento.", error);
      poseUnavailable = true;
    }

    if (!pose && (poseUnavailable || performance.now() - lastPoseAt > 700)) {
      pose = detectMotionFrame();
    } else if (!pose) {
      drawFrame();
    }

    if (pose) applyPose(pose);
    else setHint("corpo nao detectado");

    rafId = requestAnimationFrame(frame);
  }

  async function start() {
    if (enabled) return;
    enabled = true;
    resetPoseState();
    setButtonLabels();
    setStatus("iniciando");
    setHint("pedindo camera");
    applyCharacterModel();
    avatar.setAttribute("visible", "true");

    try {
      await startCamera();
      const landmarker = await ensurePoseLandmarker();
      setStatus(landmarker ? "pose ativa" : "movimento ativo");
      setHint(landmarker ? "fique de frente para calibrar" : "MediaPipe indisponivel; usando movimento da camera");
      cacheBones();
      frame();
    } catch (error) {
      console.warn("[Corpus VR] Controle corporal falhou", error);
      setStatus("erro");
      setHint("camera indisponivel");
      stop();
    }
  }

  function stop() {
    enabled = false;
    setButtonLabels();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
      stream = null;
    }
    video.srcObject = null;
    avatar.setAttribute("visible", "false");
    resetBones();
    resetPoseState();
    drawFrame();
    setStatus("offline");
    setHint("parado");
    setAction("--");
  }

  function recalibrate() {
    baseline = null;
    motionPrevious = null;
    setHint("recalibrando: fique parado de frente");
  }

  toggleButton.addEventListener("click", () => {
    if (enabled) stop();
    else start();
  });

  if (calibrateButton) {
    calibrateButton.addEventListener("click", recalibrate);
  }

  if (characterModel) {
    characterModel.addEventListener("model-loaded", () => {
      cacheBones();
    });
    characterModel.addEventListener("model-error", (event) => {
      console.warn("[Corpus VR] Modelo corporal nao carregou", event && event.detail);
      setHint("modelo corporal indisponivel");
    });
  }

  window.addEventListener("auth-state-change", applyCharacterModel);

  window.togglePoseGameControl = function () {
    if (enabled) {
      stop();
      return false;
    }
    start();
    return true;
  };

  window.calibratePoseGameControl = recalibrate;
  window.isPoseGameControlEnabled = function () {
    return enabled;
  };

  window.__corpusVRPoseDebug = {
    start,
    stop,
    recalibrate,
    cacheBones,
    bones: () => Object.keys(bones),
    model: () => currentModel,
    baseline: () => baseline,
    status: () => ({ enabled, poseUnavailable, hasPoseLandmarker: Boolean(poseLandmarker) })
  };

  applyCharacterModel();
  setButtonLabels();
  drawFrame();

  if (params.get("mirror") === "1") {
    window.setTimeout(start, 500);
  }
})();
