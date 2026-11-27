(function () {
  const video = document.getElementById("poseControlVideo");
  const canvas = document.getElementById("poseControlCanvas");
  const ctx = canvas ? canvas.getContext("2d", { willReadFrequently: true }) : null;
  const toggleButton = document.getElementById("poseGameToggle");
  const startButton = document.getElementById("startComputerVisionGame");
  const startOverlay = document.getElementById("computerVisionStart");
  const startMessage = document.getElementById("computerVisionStartMessage");
  const computerVisionHud = document.getElementById("computerVisionHud");
  const controlPanel = document.querySelector(".pose-control-panel");
  const minimizeButton = document.getElementById("poseControlMinimize");
  const calibrateButton = document.getElementById("poseGameCalibrate");
  const invertInput = document.getElementById("poseGameInvert");
  const statusEl = document.getElementById("poseGameStatus");
  const actionEl = document.getElementById("poseGameAction");
  const hintEl = document.getElementById("poseGameHint");

  if (!video || !canvas || !ctx || !toggleButton) return;

  // Pipeline de captura da versão com espelho corporal (512 x 512, contain).
  const detectionCanvas = document.createElement("canvas");
  detectionCanvas.width = 512;
  detectionCanvas.height = 512;
  const detectionCtx = detectionCanvas.getContext("2d");
  let detectionFrameTransform = null;
  let displayLandmarks = null;
  const MIRROR_CAMERA = true;
  const MEDIAPIPE_VERSION = "0.10.35";
  const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";
  const BASELINE_SAMPLE_COUNT = 15;
  const ACTION_CONFIRM_FRAMES = 2;
  const ACTION_RELEASE_FRAMES = 2;
  const EARLY_GESTURE_MS = 350;
  const TRACKING_LOSS_MS = 450;
  const MOTION_WINDOW_MS = 420;
  const MOTION_REFERENCE_MS = 85;
  const MIN_MOTION_HISTORY = 2;
  // Histerese: só um cotovelo dobrado arma o próximo soco.
  const PUNCH_EXTENDED_ANGLE = 150;
  const PUNCH_RETRACTED_ANGLE = 140;
  const PUNCH_MIN_DEPTH = 0.45;
  const PUNCH_MIN_ADVANCE = 0.16;
  const PUNCH_CONFIRM_MS = 220;
  const PUNCH_EXTENSION_WINDOW_MS = 280;
  // Somente o gesto oposto no mesmo eixo recebe uma margem durante a
  // recuperação. Não há trava global, nem pausa obrigatória entre gestos.
  const RECOVERY_CENTER = 0.18;
  const RECOVERY_OPPOSITE_MARGIN = 0.34;
  const RECOVERY_CENTER_FRAMES = 2;
  const RECOVERY_CENTER_STEP = 0.08;

  const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28]
  ];

  const REQUIRED_POINTS = [0, 11, 12];
  const UPPER_BODY_POINTS = [0, 11, 12, 13, 14, 15, 16];
  const TRACKED_POINTS = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];

  let enabled = false;
  let stream = null;
  let rafId = 0;
  let poseLandmarker = null;
  let poseLoading = false;
  let poseUnavailable = false;
  let lastVideoTime = -1;
  let baseline = null;
  let lastPoseAt = 0;
  let baselineSamples = [];
  let candidateAction = null;
  let candidateFrames = 0;
  let neutralFrames = 0;
  let candidateSince = 0;
  let consumedAction = null;
  let lastAccepted = null;
  let lastPromptId = null;
  let trackingReady = false;
  let motionHistory = [];
  let punchArms = { left: null, right: null };
  let punchEventAt = null;
  let axisRecovery = { vertical: null, lateral: null };
  const PAUSE_HOLD_MS = 350;
  const PAUSE_RELEASE_MS = 150;
  const SUMMON_HOLD_MS = 650;
  const END_MATCH_HOLD_MS = 1000;
  const SUMMON_RELEASE_MS = 220;
  let pauseSince = null;
  let pauseLatched = false;
  let pauseReleaseSince = null;
  let pauseLastFrameAt = null;
  let summonSince = null;
  let summonLatched = false;
  let summonReleaseSince = null;
  let summonLastFrameAt = null;
  let summonContext = null;

  // X de antebraços à frente do peito. Usa o lado de cada ombro, não a
  // direção absoluta da imagem (funciona também com câmera espelhada).
  // null significa braços não confiáveis: não rearma o gesto por oclusão.
  function crossedForearms(pose) {
    const {leftShoulder: ls, rightShoulder: rs, leftElbow: le, rightElbow: re,
      leftWrist: lw, rightWrist: rw, shoulderCenter: center, shoulderWidth: w} = pose;
    if (w < .055 || ![ls, rs, le, re, lw, rw].every(p => pointOk(p, .35))) return null;
    const sign = Math.sign(rs.x - ls.x);
    const x = p => (p.x - center.x) * sign / w;
    const aspect = video.videoHeight / video.videoWidth || 1;
    const y = p => (p.y - center.y) * aspect / w;
    return x(lw) > .10 && x(rw) < -.10
      && x(le) < -.07 && x(re) > .07
      && y(lw) < .28 && y(rw) < .28
      && y(lw) > -.95 && y(rw) > -.95
      && y(le) > y(lw) + .18 && y(re) > y(rw) + .18
      && y(le) > .02 && y(re) > .02;
  }

  // Mãos nos lados da cintura e cotovelos abertos: postura do Superman.
  // Todas as distâncias são relativas à largura dos ombros, corrigindo o aspecto.
  function handsOnHips(pose) {
    const {leftShoulder: ls, rightShoulder: rs, leftElbow: le, rightElbow: re,
      leftWrist: lw, rightWrist: rw, leftHip: lh, rightHip: rh,
      shoulderCenter: center, shoulderWidth: w} = pose;
    const visible = p => pointOk(p, .35) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    if (w < .055 || ![ls,rs,le,re,lw,rw].every(visible)) return null;
    const sign = Math.sign(rs.x - ls.x) || 1;
    const x = p => (p.x - center.x) * sign / w;
    const aspect = video.videoHeight / video.videoWidth || 1;
    const y = p => (p.y - center.y) * aspect / w;
    // Braços relaxados, guarda, socos e braços cruzados não formam a pose.
    if (!(x(le) < -.60 && x(re) > .60
        && x(le) < x(lw) - .18 && x(re) > x(rw) + .18
        && x(lw) < -.16 && x(rw) > .16
        && y(lw) > .38 && y(rw) > .38
        && Math.abs(y(lw)-y(rw)) < .32
        && y(le) > .04 && y(re) > .04
        && y(le) < y(lw)+.25 && y(re) < y(rw)+.25)) return false;
    if (![lh,rh].every(visible)) return null;
    const hipHeight = (y(lh)+y(rh))/2;
    if (hipHeight < .45) return false;
    const nearHip = (wrist, hip) => Math.abs(x(wrist)-x(hip)) < .42
      && y(wrist) >= y(hip) - Math.max(.45, hipHeight*.40)
      && y(wrist) <= y(hip) + .25;
    return nearHip(lw,lh) && nearHip(rw,rh);
  }

  function handleSummonGesture(pose, state) {
    const command = state?.matchCommand;
    const now = performance.now();
    const hips = handsOnHips(pose);
    if (summonLastFrameAt != null && now - summonLastFrameAt > 180) {
      summonSince = summonReleaseSince = null;
    }
    summonLastFrameAt = now;
    // Se o estado mudar por clique, não converter a mesma pose em outro comando.
    if (command !== summonContext) {
      summonContext = command;
      summonSince = summonReleaseSince = null;
      if (hips === true) summonLatched = true;
    }
    if (hips === null) {
      summonSince = summonReleaseSince = null;
      return false; // Oclusão não rearma o gesto e não bloqueia outros movimentos.
    }
    if (!hips) {
      summonSince = null;
      if (summonLatched) {
        if (summonReleaseSince == null) summonReleaseSince = now;
        if (now - summonReleaseSince >= SUMMON_RELEASE_MS) {
          summonLatched = false;
          summonReleaseSince = null;
        }
      }
      return false;
    }
    summonReleaseSince = null;
    if (!command || state.paused) {
      summonSince = null;
      summonLatched = true;
      return false;
    }
    if (summonSince == null) {
      summonSince = now;
      resetGestureState();
    }
    const hold = command === "Encerrar partida" ? END_MATCH_HOLD_MS : SUMMON_HOLD_MS;
    if (!summonLatched && now - summonSince >= hold
        && typeof window.runMatchCommand === "function" && window.runMatchCommand("visão corporal")) {
      summonLatched = true;
    }
    setAction(command);
    setStatus("pose ativa");
    setHint(summonLatched ? "Retire as mãos da cintura antes de repetir." : `Mantenha as mãos na cintura para ${command.toLowerCase()}.`);
    return true;
  }

  function handlePauseGesture(pose, state) {
    if (!state?.running) {
      pauseSince = pauseReleaseSince = pauseLastFrameAt = null;
      pauseLatched = false;
      return false;
    }
    const now = performance.now();
    // Não confirmar uma pose mantida durante uma lacuna sem quadros.
    if (pauseLastFrameAt != null && now - pauseLastFrameAt > 180) {
      pauseSince = pauseReleaseSince = null;
    }
    pauseLastFrameAt = now;
    const crossed = crossedForearms(pose);
    if (crossed === true) {
      pauseReleaseSince = null;
      if (pauseSince == null) {
        pauseSince = now;
        resetGestureState();
      }
      if (!pauseLatched && now - pauseSince >= PAUSE_HOLD_MS
          && typeof window.togglePosePause === "function" && window.togglePosePause()) {
        pauseLatched = true;
      }
      setAction("Pausa (X)");
      setStatus(state.paused ? "pausado" : "pose ativa");
      setHint(pauseLatched ? "Descruze os braços antes de repetir o gesto." : "Mantenha os antebraços cruzados em X.");
      return true;
    }
    if (crossed === null) {
      pauseSince = pauseReleaseSince = null;
      return pauseLatched || state.paused;
    }
    if (pauseSince != null || pauseLatched) {
      pauseSince = null;
      if (pauseLatched) {
        if (pauseReleaseSince == null) pauseReleaseSince = now;
        if (now - pauseReleaseSince < PAUSE_RELEASE_MS) return true;
        pauseLatched = false;
        pauseReleaseSince = null;
      }
      resetGestureState();
      return true;
    }
    return false;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setHint(text) {
    if (hintEl) hintEl.textContent = text;
  }

  function setAction(text) {
    if (actionEl) actionEl.textContent = `Ação: ${text || "--"}`;
  }

  function setButtonLabels() {
    toggleButton.textContent = enabled ? "Parar câmera" : "Ativar câmera";
  }

  function getCameraErrorMessage(error) {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    if (!window.isSecureContext && !isLocalhost) {
      return "A câmera exige uma conexão HTTPS ou acesso pelo localhost.";
    }
    if (error && error.name === "NotAllowedError") {
      return "Acesso à câmera negado. Permita o uso da câmera nas configurações do navegador.";
    }
    if (error && error.name === "NotFoundError") {
      return "Nenhuma câmera foi encontrada neste dispositivo.";
    }
    return "Não foi possível iniciar a câmera. Verifique a permissão e tente novamente.";
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function calibrationSpread(key) {
    const values = baselineSamples.map(p => p[key]).filter(Number.isFinite).sort((a, b) => a - b);
    if (values.length < 5) return 0;
    return values[Math.floor((values.length - 1) * 0.9)] - values[Math.ceil((values.length - 1) * 0.1)];
  }

  function finitePoint(point) {
    return point && Number.isFinite(point.x) && Number.isFinite(point.y);
  }

  function pointOk(point, minVisibility = 0.35) {
    return finitePoint(point) && (point.visibility == null || point.visibility >= minVisibility);
  }

  function setTrackingReady(ready) {
    if (trackingReady === ready) return;
    trackingReady = ready;
    if (typeof window.setPoseTrackingReady === "function") window.setPoseTrackingReady(ready);
  }

  function resetGestureState() {
    motionHistory = [];
    axisRecovery = { vertical: null, lateral: null };
    punchArms = { left: null, right: null };
    punchEventAt = null;
    candidateAction = null;
    candidateFrames = 0;
    candidateSince = 0;
    neutralFrames = 0;
    consumedAction = null;
    lastPromptId = null;
  }

  function resetPoseState() {
    baseline = null;
    pauseSince = pauseReleaseSince = pauseLastFrameAt = null;
    pauseLatched = false;
    summonSince = summonReleaseSince = summonLastFrameAt = null;
    summonLatched = false;
    summonContext = null;
    baselineSamples = [];
    lastVideoTime = -1;
    detectionFrameTransform = null;
    displayLandmarks = null;
    lastPoseAt = 0;
    lastAccepted = null;
    resetGestureState();
    setTrackingReady(false);
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia indisponivel");
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
      if (video.readyState >= 1 && video.videoWidth) resolve();
      else video.addEventListener("loadedmetadata", resolve, { once: true });
    });
    await video.play();
  }

  async function ensurePoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    poseUnavailable = false;
    if (poseLoading) {
      while (poseLoading) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return poseLandmarker;
    }

    poseLoading = true;
    setStatus("carregando IA");

    try {
      // O bundle ESM deve ser explícito: a raiz do pacote pode servir CommonJS.
      // Se um CDN estiver bloqueado, tente o mesmo pacote em outro CDN.
      let lastError;
      for (const base of [
        `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`,
        `https://unpkg.com/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`
      ]) {
        try {
          const vision = await import(`${base}/vision_bundle.mjs`);
          const resolver = await vision.FilesetResolver.forVisionTasks(`${base}/wasm`);
          const options = {
            baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: "GPU" },
            runningMode: "VIDEO", numPoses: 1,
            // A máscara de segmentação do espelho VR não é usada no combate.
            outputSegmentationMasks: false,
            minPoseDetectionConfidence: 0.45,
            minPosePresenceConfidence: 0.45,
            minTrackingConfidence: 0.45
          };
          try {
            poseLandmarker = await vision.PoseLandmarker.createFromOptions(resolver, options);
          } catch (gpuError) {
            console.warn("[Corpus VR] GPU MediaPipe indisponível; usando CPU.", gpuError);
            poseLandmarker = await vision.PoseLandmarker.createFromOptions(resolver, {
              ...options, baseOptions: { ...options.baseOptions, delegate: "CPU" }
            });
          }
          return poseLandmarker;
        } catch (error) {
          lastError = error;
          console.warn("[Corpus VR] Falha ao carregar MediaPipe de", base, error);
        }
      }
      throw lastError || new Error("MediaPipe indisponível");
    } catch (error) {
      console.warn("[Corpus VR] MediaPipe indisponível.", error);
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

  function drawFrame(landmarks, capturedFrame = false) {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    if (MIRROR_CAMERA) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }

    if (video.videoWidth && video.videoHeight) {
      if (capturedFrame && detectionFrameTransform) {
        const { offsetX, offsetY, drawWidth, drawHeight } = detectionFrameTransform;
        // Imagem e pontos são do MESMO quadro, com a mesma transformação.
        ctx.drawImage(detectionCanvas, offsetX, offsetY, drawWidth, drawHeight, 0, 0, width, height);
      } else ctx.drawImage(video, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#07131F";
      ctx.fillRect(0, 0, width, height);
    }

    if (video.videoWidth && video.videoHeight) {
      ctx.fillStyle = "rgba(7, 19, 31, 0.22)";
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

    if (Array.isArray(landmarks)) {
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
    ctx.restore();
  }

  // Adaptado de buildDetectionSource/remapDetectionLandmarks do projeto VR.
  function buildDetectionSource() {
    const sourceWidth = video.videoWidth, sourceHeight = video.videoHeight;
    const targetWidth = detectionCanvas.width, targetHeight = detectionCanvas.height;
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale;
    const offsetX = (targetWidth - drawWidth) / 2, offsetY = (targetHeight - drawHeight) / 2;
    detectionFrameTransform = { offsetX, offsetY, drawWidth, drawHeight };
    detectionCtx.fillStyle = "#000";
    detectionCtx.fillRect(0, 0, targetWidth, targetHeight);
    detectionCtx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    return detectionCanvas;
  }

  function remapDetectionLandmarks(landmarks) {
    if (!Array.isArray(landmarks) || !detectionFrameTransform) return null;
    const { offsetX, offsetY, drawWidth, drawHeight } = detectionFrameTransform;
    return landmarks.map(point => {
      if (!finitePoint(point)) return null;
      return {
        ...point,
        x: (point.x * detectionCanvas.width - offsetX) / drawWidth,
        y: (point.y * detectionCanvas.height - offsetY) / drawHeight,
        // z do MediaPipe usa a largura da imagem de entrada como unidade.
        z: Number.isFinite(point.z) ? point.z * detectionCanvas.width / drawWidth : undefined
      };
    });
  }

  // Suavização adaptativa inspirada no espelho VR. Só o desenho é suavizado;
  // os gestos usam os pontos atuais para não atrasar socos e esquivas rápidas.
  function smoothDisplay(landmarks) {
    if (!landmarks) { displayLandmarks = null; return null; }
    const previous = displayLandmarks;
    displayLandmarks = landmarks.map((point, i) => {
      const old = previous?.[i];
      if (!point || !old || !pointOk(old) || !pointOk(point)) return point;
      const movement = Math.hypot(point.x - old.x, point.y - old.y);
      const amount = movement < 0.006 ? 0.08 : movement < 0.018 ? 0.34 : 1;
      return { ...point, x: old.x + (point.x - old.x) * amount, y: old.y + (point.y - old.y) * amount };
    });
    return displayLandmarks;
  }

  function mirrorLandmarks(landmarks) {
    if (!MIRROR_CAMERA || !Array.isArray(landmarks)) return landmarks;
    return landmarks.map((point) => point ? { ...point, x: 1 - point.x } : point);
  }

  function qualityOf(landmarks) {
    if (!Array.isArray(landmarks)) return 0;
    const visible = UPPER_BODY_POINTS.filter((index) => pointOk(landmarks[index], 0.25)).length;
    return visible / UPPER_BODY_POINTS.length;
  }

  function center(a, b) {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: ((a.z || 0) + (b.z || 0)) / 2,
      visibility: Math.min(a.visibility == null ? 1 : a.visibility, b.visibility == null ? 1 : b.visibility)
    };
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
    const onScreenHip = p => pointOk(p, 0.5) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1;
    const hipCenter = onScreenHip(leftHip) && onScreenHip(rightHip)
      ? center(leftHip, rightHip)
      : null;
    const bodyCenter = hipCenter ? center(shoulderCenter, hipCenter) : shoulderCenter;
    const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x);
    const stanceWidth = pointOk(leftAnkle, 0.2) && pointOk(rightAnkle, 0.2)
      ? Math.abs(rightAnkle.x - leftAnkle.x)
      : shoulderWidth;
    const kneeCenterY = hipCenter && pointOk(leftKnee, 0.2) && pointOk(rightKnee, 0.2)
      ? (leftKnee.y + rightKnee.y) / 2
      : null;

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
      torsoDepth: ((nose.z || 0) + shoulderCenter.z) / 2,
      shoulderWidth,
      stanceWidth,
      kneeCenterY
    };
  }

  function visibleAnkleY(pose) {
    const ankles = [pose.leftAnkle, pose.rightAnkle];
    if (!ankles.every(p => pointOk(p, 0.65) && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)) return null;
    return (ankles[0].y + ankles[1].y) / 2;
  }

  function baselineFromPose(pose) {
    const leftArmOffset = pointOk(pose.leftWrist, 0.2)
      ? {
        x: pose.leftWrist.x - pose.leftShoulder.x,
        y: pose.leftWrist.y - pose.leftShoulder.y
      }
      : null;
    const rightArmOffset = pointOk(pose.rightWrist, 0.2)
      ? {
        x: pose.rightWrist.x - pose.rightShoulder.x,
        y: pose.rightWrist.y - pose.rightShoulder.y
      }
      : null;

    return {
      x: pose.bodyCenter.x,
      shoulderX: pose.shoulderCenter.x,
      shoulderY: pose.shoulderCenter.y,
      shoulderSlope: pose.rightShoulder.y - pose.leftShoulder.y,
      hipY: pose.hipCenter ? pose.hipCenter.y : null,
      ankleY: visibleAnkleY(pose),
      noseY: pose.nose.y,
      noseX: pose.nose.x,
      shoulderZ: pose.shoulderCenter.z,
      noseZ: pose.nose.z || 0,
      noseShoulderGapY: pose.nose.y - pose.shoulderCenter.y,
      width: pose.shoulderWidth,
      stanceWidth: pose.stanceWidth,
      kneeGap: pose.kneeCenterY != null && pose.hipCenter
        ? pose.kneeCenterY - pose.hipCenter.y
        : null,
      torsoDepth: pose.torsoDepth,
      leftPunchDepth: pointOk(pose.leftWrist, 0.2)
        ? pose.leftWrist.z - pose.leftShoulder.z
        : null,
      rightPunchDepth: pointOk(pose.rightWrist, 0.2)
        ? pose.rightWrist.z - pose.rightShoulder.z
        : null,
      leftArmOffsetX: leftArmOffset ? leftArmOffset.x : null,
      leftArmOffsetY: leftArmOffset ? leftArmOffset.y : null,
      rightArmOffsetX: rightArmOffset ? rightArmOffset.x : null,
      rightArmOffsetY: rightArmOffset ? rightArmOffset.y : null
    };
  }

  function ensureBaseline(pose) {
    if (baseline) return true;
    if (!pose || pose.quality < 0.85 || pose.shoulderWidth < 0.055
      || ![pose.leftWrist, pose.rightWrist, pose.leftElbow, pose.rightElbow].every(p => pointOk(p, 0.3))) {
      baselineSamples = [];
      setHint("enquadre cabeça, ombros e braços");
      return false;
    }

    const sample = baselineFromPose(pose);
    const previous = baselineSamples[baselineSamples.length - 1];
    if (previous && (
      Math.abs(sample.x - previous.x) > 0.035
      || Math.abs(sample.shoulderY - previous.shoulderY) > 0.035
      || Math.abs(sample.width - previous.width) > 0.025
      || Math.abs(sample.noseX - previous.noseX) > 0.025
      || Math.abs(sample.noseY - previous.noseY) > 0.025
      || Math.abs(sample.leftPunchDepth - previous.leftPunchDepth) > 0.045
      || Math.abs(sample.rightPunchDepth - previous.rightPunchDepth) > 0.045
    )) {
      baselineSamples = [];
    }
    baselineSamples.push(sample);

    if (baselineSamples.length < BASELINE_SAMPLE_COUNT) {
      setHint(`fique parado, braços relaxados ou em guarda (${baselineSamples.length}/${BASELINE_SAMPLE_COUNT})`);
      return false;
    }

    baseline = {
      x: median(baselineSamples.map((item) => item.x)),
      shoulderX: median(baselineSamples.map((item) => item.shoulderX)),
      shoulderY: median(baselineSamples.map((item) => item.shoulderY)),
      shoulderSlope: median(baselineSamples.map((item) => item.shoulderSlope)),
      hipY: median(baselineSamples.map((item) => item.hipY)),
      ankleY: baselineSamples.filter(item => Number.isFinite(item.ankleY)).length >= Math.ceil(BASELINE_SAMPLE_COUNT / 2)
        ? median(baselineSamples.map(item => item.ankleY)) : null,
      noseY: median(baselineSamples.map((item) => item.noseY)),
      noseX: median(baselineSamples.map((item) => item.noseX)),
      shoulderZ: median(baselineSamples.map((item) => item.shoulderZ)),
      noseZ: median(baselineSamples.map((item) => item.noseZ)),
      noseShoulderGapY: median(baselineSamples.map((item) => item.noseShoulderGapY)),
      width: median(baselineSamples.map((item) => item.width)),
      stanceWidth: median(baselineSamples.map((item) => item.stanceWidth)),
      kneeGap: median(baselineSamples.map((item) => item.kneeGap)),
      torsoDepth: median(baselineSamples.map((item) => item.torsoDepth)),
      leftPunchNoise: calibrationSpread("leftPunchDepth"),
      rightPunchNoise: calibrationSpread("rightPunchDepth"),
      leftPunchDepth: median(baselineSamples.map((item) => item.leftPunchDepth)),
      rightPunchDepth: median(baselineSamples.map((item) => item.rightPunchDepth)),
      leftArmOffsetX: median(baselineSamples.map((item) => item.leftArmOffsetX)),
      leftArmOffsetY: median(baselineSamples.map((item) => item.leftArmOffsetY)),
      rightArmOffsetX: median(baselineSamples.map((item) => item.rightArmOffsetX)),
      rightArmOffsetY: median(baselineSamples.map((item) => item.rightArmOffsetY))
    };
    baselineSamples = [];
    setHint("calibrado");
    return true;
  }

  const ACTION_NAMES = {
    attack: "soco", dodgeLeft: "esquiva esquerda", dodgeRight: "esquiva direita",
    duck: "agachar", jump: "pular"
  };

  // Trabalha em coordenadas relativas ao ombro: aproximar o corpo inteiro
  // da câmera não deve ser confundido com estender o braço para a frente.
  function armMotion(wrist, elbow, shoulder, width) {
    // Sem os três pontos confiáveis não é possível provar a extensão.
    if (![wrist, elbow, shoulder].every(p => pointOk(p, 0.35) && Number.isFinite(p.z))) return null;
    // x/z são normalizados pela largura; y é normalizado pela altura.
    const aspectY = (video.videoHeight / video.videoWidth) || 1;
    const vector = (a, b) => [(a.x-b.x)/width, (a.y-b.y)*aspectY/width, (a.z-b.z)/width];
    const upper = vector(elbow, shoulder);
    const fore = vector(wrist, elbow);
    const reach = vector(wrist, shoulder);
    const upperLength = Math.hypot(...upper), foreLength = Math.hypot(...fore);
    const reachLength = Math.hypot(...reach);
    if (upperLength < 0.12 || foreLength < 0.12) return null;
    const dot = upper.reduce((sum, v, i) => sum + v * fore[i], 0);
    const cosine = Math.max(-1, Math.min(1, -dot / (upperLength * foreLength)));
    return {
      angle: Math.acos(cosine) * 180 / Math.PI,
      depth: -reach[2],
      forward: -reach[2] / Math.max(reachLength, 0.001),
      upperDepth: -upper[2],
      forearmDepth: -fore[2]
    };
  }

  function armPunch(side, arm, now) {
    if (!arm) { punchArms[side] = null; return null; }
    const state = punchArms[side] ||= { bentFrames: 0, ready: false, restDepth: null, restAngle: null, extensionAt: null, nearAt: null, pending: null };
    if (arm.angle <= PUNCH_RETRACTED_ANGLE) {
      state.pending = null;
      state.extensionAt = null;
      state.nearAt = null;
      state.bentFrames += 1;
      if (state.bentFrames >= ACTION_RELEASE_FRAMES) {
        // Preserve o início da extensão gradual, mesmo com pequenas oscilações.
        state.restDepth = state.ready ? Math.min(state.restDepth, arm.depth) : arm.depth;
        state.restAngle = state.ready ? Math.min(state.restAngle, arm.angle) : arm.angle;
        state.ready = true;
      }
      return null;
    }
    state.bentFrames = 0;
    const extended = arm.angle >= PUNCH_EXTENDED_ANGLE;
    const forward = arm.depth >= PUNCH_MIN_DEPTH && arm.forward >= 0.50
      && arm.upperDepth >= 0.06 && arm.forearmDepth >= 0.06;
    const noise = (side === "left" ? baseline.leftPunchNoise : baseline.rightPunchNoise) / Math.max(baseline.width, 0.055);
    const advance = arm.depth - state.restDepth >= Math.max(PUNCH_MIN_ADVANCE, 1.5 * noise);
    const straightened = arm.angle - state.restAngle >= 15;
    const valid = extended && forward && advance && straightened;
    if (state.pending) {
      const event = state.pending;
      // Um segundo quadro ainda quase reto confirma uma extensão real mesmo
      // se o ângulo estimado oscilar ou o braço já começar a voltar.
      const confirms = arm.angle >= 145 && forward && advance && straightened;
      if (!confirms || now - event.at > (event.confirmed ? EARLY_GESTURE_MS : PUNCH_CONFIRM_MS)) {
        state.pending = null;
        return null;
      }
      event.frames += 1;
      event.confirmed = event.frames >= ACTION_CONFIRM_FRAMES;
      return event.confirmed ? event.at : null;
    }
    if (!state.ready) return null;
    if (extended && state.extensionAt == null) {
      // Extensão claramente lateral/para baixo não é uma tentativa de soco.
      if (arm.forward < 0.30) {
        state.ready = false;
        return null;
      }
      state.extensionAt = now;
    }
    // Não perder a tentativa só porque a extensão chegou antes da profundidade.
    // A janela curta impede que um braço estendido de lado por muito tempo
    // passe a disparar um soco sem ser recolhido.
    if (state.extensionAt != null && now - state.extensionAt > PUNCH_EXTENSION_WINDOW_MS) {
      state.ready = false;
      return null;
    }
    if (valid) {
      // Também confirmar pelo quadro imediatamente ANTERIOR ao pico: em
      // socos rápidos a webcam pode não capturar dois quadros no fim do golpe.
      const confirmed = state.nearAt != null && now - state.nearAt <= PUNCH_CONFIRM_MS;
      state.ready = false;
      state.pending = { at: now, frames: confirmed ? ACTION_CONFIRM_FRAMES : 1, confirmed };
      state.nearAt = null;
      return confirmed ? now : null;
    }
    state.nearAt = arm.angle >= 145 && forward && advance && straightened ? now : null;
    return null;
  }

  function motionSample(pose, now) {
    const width = Math.max(baseline.width, 0.055);
    const heightUnit = width * ((video.videoWidth / video.videoHeight) || 1);
    const ankleY = visibleAnkleY(pose);
    return {
      at: now,
      ankleY: ankleY != null && baseline.ankleY != null ? (ankleY - baseline.ankleY) / heightUnit : null,
      shoulderX: (pose.shoulderCenter.x - baseline.shoulderX) / width,
      headX: (pose.nose.x - baseline.noseX) / width,
      shoulderY: (pose.shoulderCenter.y - baseline.shoulderY) / heightUnit,
      headY: (pose.nose.y - baseline.noseY) / heightUnit,
      hipY: pose.hipCenter && baseline.hipY != null ? (pose.hipCenter.y - baseline.hipY) / heightUnit : null,
      left: armMotion(pose.leftWrist, pose.leftElbow, pose.leftShoulder, width),
      right: armMotion(pose.rightWrist, pose.rightElbow, pose.rightShoulder, width)
    };
  }

  function updateAxisRecovery(sample) {
    for (const [axis, keys] of [["vertical", ["shoulderY", "headY"]], ["lateral", ["shoulderX", "headX"]]]) {
      const recovery = axisRecovery[axis];
      if (!recovery) continue;
      // Só importa o eixo do gesto anterior; o outro eixo e o quadril
      // não precisam estar centralizados. Só descartamos a recuperação
      // quando a passagem pelo centro desacelera neste eixo (não basta
      // cruzar rapidamente duas posições próximas ao centro).
      const centered = keys.every(key => Math.abs(sample[key]) <= RECOVERY_CENTER);
      const slow = recovery.previousCenter && keys.every(key => Math.abs(sample[key] - recovery.previousCenter[key]) <= RECOVERY_CENTER_STEP);
      recovery.centerFrames = centered ? (slow ? recovery.centerFrames + 1 : 1) : 0;
      recovery.previousCenter = centered ? sample : null;
      if (recovery.centerFrames >= RECOVERY_CENTER_FRAMES) axisRecovery[axis] = null;
    }
  }

  function allowOpposite(axis, direction, sample) {
    const recovery = axisRecovery[axis];
    if (!recovery || recovery.direction === direction) return true;
    // O retorno pode cruzar o centro. Um pequeno excesso de posição não
    // é um novo gesto. Um deslocamento intencional mais amplo, porém, pode
    // ser reconhecido imediatamente, inclusive em uma sequência rápida.
    const keys = axis === "vertical" ? ["shoulderY", "headY"] : ["shoulderX", "headX"];
    const clearExcursion = keys.every(key => direction * sample[key] >= RECOVERY_OPPOSITE_MARGIN);
    // Se os pés estão no quadro, sua elevação é evidência adicional de
    // salto real ao sair de um agachamento. Não exigir pés no restante.
    if (axis === "vertical" && direction === -1 && sample.ankleY != null) {
      // Durante a subida do agachamento, pés confiáveis ainda no chão
      // distinguem o retorno de um salto, mesmo com grande oscilação do tronco.
      return sample.ankleY < -0.12;
    }
    return clearExcursion;
  }

  function rememberBodyGesture(action) {
    if (action === "duck" || action === "jump") {
      axisRecovery.vertical = { direction: action === "duck" ? 1 : -1, centerFrames: 0 };
    } else if (action === "dodgeLeft" || action === "dodgeRight") {
      const direction = (action === "dodgeLeft" ? -1 : 1) * (invertInput?.checked ? -1 : 1);
      axisRecovery.lateral = { direction, centerFrames: 0 };
    }
  }

  function chooseAction(pose) {
    if (!baseline || !pose) return null;
    const now = performance.now();
    const sample = motionSample(pose, now);
    updateAxisRecovery(sample);
    motionHistory = motionHistory.filter(p => now - p.at <= MOTION_WINDOW_MS);
    // Cada braço confirma sua própria transição; um braço não confirma o outro.
    const punches = [armPunch("left", sample.left, now), armPunch("right", sample.right, now)].filter(Number.isFinite);
    punchEventAt = punches.length ? Math.min(...punches) : null;
    // Compare com a mediana de quadros anteriores, não com um quadro isolado
    // nem só com a calibração inicial. Uma postura parada não é uma ação.
    const past = motionHistory.filter(p => now - p.at >= MOTION_REFERENCE_MS);
    const reference = past.length >= MIN_MOTION_HISTORY ? past : motionHistory.slice();
    motionHistory.push(sample);
    if (reference.length < MIN_MOTION_HISTORY) return punchEventAt != null ? "attack" : null;
    // A referência curta permite repetir um movimento logo após recolher o
    // braço / voltar ao centro, mesmo com o gesto anterior no histórico.
    const recent = motionHistory.slice(-3, -1);
    const references = [reference, recent];
    const delta = (frames, key) => {
      const before = median(frames.map(p => p[key]));
      return before == null || sample[key] == null ? null : sample[key] - before;
    };
    const continuing = action => candidateAction === action && now - candidateSince < 180;
    const movedVertically = (direction, shoulderMin, headMin, hipMin) => references.some(frames => {
      const hip = delta(frames, "hipY");
      return direction * delta(frames, "shoulderY") > shoulderMin
        && direction * delta(frames, "headY") > headMin
        && (hip == null || direction * hip > hipMin);
    });

    // Cabeça e ombros devem se mover juntos, para ignorar balanço normal,
    // piscadas, ajustes de postura e oscilações dos pontos estimados.
    const crouched = sample.shoulderY > 0.30 && sample.headY > 0.28
      && (sample.hipY == null ? sample.shoulderY > 0.34 : sample.hipY > 0.18);
    if (crouched && allowOpposite("vertical", 1, sample) && (movedVertically(1, 0.18, 0.16, 0.09) || continuing("duck"))) return "duck";
    const elevated = sample.shoulderY < -0.23 && sample.headY < -0.20
      && (sample.hipY == null || sample.hipY < -0.10);
    if (!(typeof isJumpDisabled === "function" && isJumpDisabled()) && elevated && allowOpposite("vertical", -1, sample)
      && (movedVertically(-1, 0.15, 0.13, 0.06) || continuing("jump"))) return "jump";

    // Um soco pode girar os ombros: priorize a extensão confirmada.
    if (punchEventAt != null) return "attack";

    // A direção da esquiva segue a imagem espelhada. Não basta inclinar só
    // a cabeça ou deslocar um ombro durante um soco.
    const direction = Math.sign(sample.shoulderX);
    const shifted = Math.abs(sample.shoulderX) > 0.19 && direction * sample.headX > 0.13;
    const moved = references.some(frames => direction * delta(frames, "shoulderX") > 0.11
      && direction * delta(frames, "headX") > 0.09);
    let action = direction < 0 ? "dodgeLeft" : "dodgeRight";
    if (invertInput && invertInput.checked) action = action === "dodgeLeft" ? "dodgeRight" : "dodgeLeft";
    if (shifted && allowOpposite("lateral", direction, sample) && (moved || continuing(action))) return action;
    return null;
  }

  function dispatchAction(action) {
    const now = performance.now();
    if (!action) {
      candidateAction = null;
      candidateFrames = 0;
      neutralFrames += 1;
      if (neutralFrames >= ACTION_RELEASE_FRAMES) consumedAction = null;
      return;
    }
    neutralFrames = 0;
    if (candidateAction === action) candidateFrames += 1;
    else {
      candidateAction = action;
      candidateFrames = 1;
      candidateSince = now;
    }
    // Socos já foram confirmados em dois quadros consecutivos do mesmo braço.
    if (action === "attack" && punchEventAt != null) {
      candidateSince = punchEventAt;
    } else if (candidateFrames < ACTION_CONFIRM_FRAMES) return;
    // Registrar a excursão física mesmo fora da janela do combate, sem
    // alterar a confirmação ou a prioridade dos movimentos da v4.
    if (action !== "attack") rememberBodyGesture(action);
    // Um gesto diferente confirmado também libera o gesto anterior.
    if (consumedAction && consumedAction !== action) consumedAction = null;
    const state = typeof window.getGameInputState === "function" ? window.getGameInputState() : null;
    if (!state || !state.running || state.paused || !state.waitingInput || state.trackingReady === false) return;
    if ((action !== "attack" && consumedAction === action) || lastPromptId === state.promptId) return;
    // Aceita gestos iniciados junto do aviso, mas não uma postura antiga mantida.
    if (candidateSince < state.promptStartTime - EARLY_GESTURE_MS) return;
    if (typeof window.dispatchGameAction !== "function") return;
    if (window.dispatchGameAction(action, "visão corporal") !== true) return;
    // Só consumir depois que o jogo realmente recebeu a ação.
    consumedAction = action;
    if (action === "attack") {
      // Não repetir o evento na próxima janela, nem após outro gesto.
      for (const arm of Object.values(punchArms)) if (arm) arm.pending = null;
    }
    lastPromptId = state.promptId;
    lastAccepted = { action, at: now };
  }

  function applyPose(pose) {
    if (!ensureBaseline(pose)) return;
    setTrackingReady(true);
    let state = typeof window.getGameInputState === "function" ? window.getGameInputState() : null;
    if (state && !state.running && !state.sessionReady && typeof window.prepareGameStart === "function") {
      // Calibração inicial concluída: mostrar a interface, sem iniciar o combate.
      if (startOverlay) startOverlay.hidden = true;
      if (computerVisionHud) computerVisionHud.hidden = false;
      window.prepareGameStart();
      state = window.getGameInputState();
    }
    if (handlePauseGesture(pose, state)) {
      summonSince = summonReleaseSince = null;
      return;
    }
    if (handleSummonGesture(pose, state)) return;
    if (state?.paused) {
      resetGestureState();
      setStatus("pausado");
      setAction("--");
      setHint("Cruze os antebraços em X para retomar.");
      return;
    }
    if (state?.awaitingEnemyStart || !state?.running) {
      resetGestureState();
      setStatus("aguardando início");
      setAction("--");
      setHint(`${state?.matchCommand || "Iniciar jogo"}: clique no botão ou coloque as mãos na cintura.`);
      return;
    }
    const action = chooseAction(pose);
    dispatchAction(action);
    const acceptedRecently = lastAccepted && performance.now() - lastAccepted.at < 850;
    const acceptedCurrent = acceptedRecently && action === lastAccepted.action && consumedAction === action;
    setAction(action ? `${ACTION_NAMES[action]}${acceptedCurrent ? " ✓ recebido" : " (detectado)"}` : "--");
    setStatus("pose ativa");
    setHint(`Pose ${Math.round(pose.quality * 100)}%${acceptedRecently ? ` • último recebido: ${ACTION_NAMES[lastAccepted.action]}` : (action ? " • aguarde o aviso / volte ao centro" : "")}`);
  }

  async function waitForBaseline(timeoutMs) {
    const deadline = performance.now() + timeoutMs;
    while (enabled && !baseline && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return enabled && Boolean(baseline);
  }

  function detectPoseFrame() {
    if (!poseLandmarker || !video.videoWidth || video.currentTime === lastVideoTime) return null;
    lastVideoTime = video.currentTime;
    const result = poseLandmarker.detectForVideo(buildDetectionSource(), performance.now());
    const rawLandmarks = result && result.landmarks && result.landmarks[0];
    const fullFrameLandmarks = remapDetectionLandmarks(rawLandmarks);
    if (!fullFrameLandmarks) { smoothDisplay(null); return null; }
    drawFrame(smoothDisplay(fullFrameLandmarks), true);
    const landmarks = mirrorLandmarks(fullFrameLandmarks);
    const pose = readPose(landmarks, "pose");
    if (pose) lastPoseAt = performance.now();
    return pose;
  }

  function frame() {
    if (!enabled) return;
    // O loop da tela pode rodar mais rápido que a webcam. Não contar um quadro
    // duplicado como perda de pose nem como confirmação de um gesto.
    rafId = requestAnimationFrame(frame);
    updateCanvasSize();
    if (!video.videoWidth || video.currentTime === lastVideoTime) {
      if (trackingReady && performance.now() - lastPoseAt > TRACKING_LOSS_MS) {
        setTrackingReady(false);
        resetGestureState();
        pauseSince = pauseReleaseSince = pauseLastFrameAt = null;
        summonSince = summonReleaseSince = summonLastFrameAt = null;
        setStatus("sem imagem");
        setHint("Aguardando novos quadros da câmera.");
      }
      return;
    }
    try {
      const pose = detectPoseFrame();
      if (pose) {
        applyPose(pose);
        return;
      }
      pauseSince = pauseReleaseSince = pauseLastFrameAt = null;
      summonSince = summonReleaseSince = summonLastFrameAt = null;
      drawFrame(null, true);
      displayLandmarks = null;
      motionHistory = [];
      for (const recovery of Object.values(axisRecovery)) if (recovery) {
        recovery.centerFrames = 0;
        recovery.previousCenter = null;
      }
      punchArms = { left: null, right: null };
      punchEventAt = null;
      if (!baseline) baselineSamples = [];
      candidateAction = null;
      candidateFrames = 0;
      if (performance.now() - lastPoseAt > TRACKING_LOSS_MS) {
        setTrackingReady(false);
        resetGestureState();
        setStatus("corpo não detectado");
        setAction("--");
        setHint("Enquadre cabeça, ombros e braços. Combate aguardando.");
      }
    } catch (error) {
      console.error("[Corpus VR] Falha na leitura da pose", error);
      setTrackingReady(false);
      resetGestureState();
      setStatus("erro de rastreamento");
      setHint("Desligue e religue a câmera para tentar novamente.");
      cancelAnimationFrame(rafId);
      poseUnavailable = true;
      if (poseLandmarker && typeof poseLandmarker.close === "function") poseLandmarker.close();
      poseLandmarker = null;
    }
  }

  async function start() {
    if (enabled) return Boolean(poseLandmarker);
    enabled = true;
    resetPoseState();
    if (typeof window.setPoseTrackingReady === "function") window.setPoseTrackingReady(false);
    setButtonLabels();
    setStatus("iniciando");
    setHint("pedindo camera");

    try {
      await startCamera();
      const landmarker = await ensurePoseLandmarker();
      if (!landmarker) throw new Error("POSE_MODEL_UNAVAILABLE");
      setStatus("calibrando");
      setHint("fique de frente para calibrar");
      frame();
      if (startMessage) {
        startMessage.textContent = "Câmera ativa. Fique de frente para calibrar seus movimentos. Depois, clique em Iniciar jogo ou coloque as mãos na cintura.";
      }
      return true;
    } catch (error) {
      console.warn("[Corpus VR] Controle corporal falhou", error);
      stop();
      setStatus("erro");
      const message = error.message === "POSE_MODEL_UNAVAILABLE"
        ? "Não foi possível carregar o MediaPipe. Verifique a internet e tente novamente (CDN e modelo de pose)."
        : getCameraErrorMessage(error);
      setHint(message);
      if (startMessage) startMessage.textContent = message;
      return false;
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
    resetPoseState();
    if (typeof window.setPoseTrackingReady === "function") window.setPoseTrackingReady(true);
    drawFrame();
    setStatus("offline");
    setHint("parado");
    setAction("--");
  }

  function recalibrate() {
    resetPoseState();
    setAction("--");
    setHint("recalibrando: fique parado de frente, braços relaxados ou em guarda");
  }

  toggleButton.addEventListener("click", () => {
    if (enabled) {
      stop();
      if (typeof resetGame === "function") resetGame({ keepReady: false });
      if (computerVisionHud) computerVisionHud.hidden = true;
      if (startOverlay) startOverlay.hidden = false;
      if (startMessage) startMessage.textContent = "A câmera foi desligada.";
    }
    else start();
  });

  if (startButton) {
    startButton.addEventListener("click", async () => {
      startButton.disabled = true;
      if (startMessage) startMessage.textContent = "Conectando à câmera...";
      const started = await start();
      if (!started) {
        startButton.disabled = false;
        return;
      }

      setStatus("calibrando");
      setHint("fique parado de frente para a câmera");
      if (startMessage) {
        startMessage.textContent = "Centralize o corpo na imagem e fique parado enquanto calibramos.";
      }
      const calibrated = await waitForBaseline(8000);
      startButton.disabled = false;
      if (!calibrated) {
        setStatus("ajuste posição");
        if (startMessage) {
          startMessage.textContent = "Não consegui calibrar. Ajuste o enquadramento, fique parado e tente novamente.";
        }
        return;
      }

      setStatus("pose ativa");
      if (startOverlay) startOverlay.hidden = true;
      if (computerVisionHud) computerVisionHud.hidden = false;
      if (!window.getGameInputState()?.sessionReady && typeof window.prepareGameStart === "function") window.prepareGameStart();
    });
  }

  if (controlPanel && minimizeButton) {
    minimizeButton.addEventListener("click", () => {
      const minimized = controlPanel.classList.toggle("is-minimized");
      minimizeButton.textContent = minimized ? "+" : "−";
      minimizeButton.setAttribute("aria-expanded", String(!minimized));
      minimizeButton.setAttribute(
        "aria-label",
        minimized ? "Expandir painel da câmera" : "Minimizar painel da câmera"
      );
    });
  }

  if (calibrateButton) {
    calibrateButton.addEventListener("click", recalibrate);
  }

  window.togglePoseGameControl = function () {
    if (enabled) {
      stop();
      return false;
    }
    return start();
  };

  window.calibratePoseGameControl = recalibrate;
  window.isPoseGameControlEnabled = function () {
    return enabled;
  };

  window.__corpusVRPoseDebug = {
    start,
    stop,
    recalibrate,
    waitForBaseline,
    baseline: () => baseline,
    status: () => ({ enabled, poseUnavailable, hasPoseLandmarker: Boolean(poseLandmarker), trackingReady, candidateAction, candidateFrames, lastAccepted })
  };

  setButtonLabels();
  drawFrame();

})();
