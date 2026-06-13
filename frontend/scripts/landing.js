(function () {
  const cameraToggleButton = document.getElementById("cameraToggleButton");
  const cameraStateLabel = document.getElementById("cameraStateLabel");
  const cameraPreview = document.getElementById("cameraPreview");
  const cameraCanvas = document.getElementById("cameraCanvas");
  const cameraHint = document.getElementById("cameraHint");
  const motionMetric = document.getElementById("motionMetric");
  const motionXMetric = document.getElementById("motionXMetric");
  const motionYMetric = document.getElementById("motionYMetric");
  const poseMirrorButton = document.getElementById("poseMirrorButton");
  const poseStatusLabel = document.getElementById("poseStatusLabel");
  const shoulderTiltMetric = document.getElementById("shoulderTiltMetric");
  const hipTiltMetric = document.getElementById("hipTiltMetric");
  const turnBiasMetric = document.getElementById("turnBiasMetric");
  const centerShiftMetric = document.getElementById("centerShiftMetric");
  const poseInsight = document.getElementById("poseInsight");
  const dbStatusLabel = document.getElementById("dbStatusLabel");
  const sessionStatusLabel = document.getElementById("sessionStatusLabel");
  const refreshStatsButton = document.getElementById("refreshStatsButton");
  const statAttempts = document.getElementById("statAttempts");
  const statAccuracy = document.getElementById("statAccuracy");
  const statReaction = document.getElementById("statReaction");
  const statSessions = document.getElementById("statSessions");
  const statsSummary = document.getElementById("statsSummary");
  const statsChatForm = document.getElementById("statsChatForm");
  const statsChatInput = document.getElementById("statsChatInput");
  const chatTranscript = document.getElementById("chatTranscript");
  const startGameLink = document.getElementById("startGameLink");
  const mirrorGameLink = document.getElementById("mirrorGameLink");
  const phoneGameLink = document.getElementById("phoneGameLink");
  const roomCodeInput = document.getElementById("roomCodeInput");
  const roomGenerateButton = document.getElementById("roomGenerateButton");
  const roomNetworkHint = document.getElementById("roomNetworkHint");

  const cameraCtx = cameraCanvas ? cameraCanvas.getContext("2d", { willReadFrequently: true }) : null;
  const motionCanvas = document.createElement("canvas");
  const motionCtx = motionCanvas.getContext("2d", { willReadFrequently: true });
  const MIRROR_CAMERA = true;
  const ROOM_STORAGE_KEY = "hb_room_code";

  let cameraStream = null;
  let cameraFrameId = 0;
  let previousMotionFrame = null;
  let poseMirrorEnabled = false;
  let poseLandmarker = null;
  let poseLoading = false;
  let lastPoseVideoTime = -1;
  let roomInfo = null;

  const POSE_CONNECTIONS = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24],
    [23, 25], [25, 27], [24, 26], [26, 28],
    [27, 31], [28, 32]
  ];

  function isSessionReady() {
    return typeof isLoggedIn === "function" && isLoggedIn();
  }

  function authHeaders(extra) {
    return typeof getAuthHeaders === "function" ? getAuthHeaders(extra) : (extra || {});
  }

  function setSessionStatus() {
    if (!sessionStatusLabel) return;
    sessionStatusLabel.textContent = isSessionReady() ? "online" : "offline";
  }

  function formatPercent(value) {
    return `${Math.round(Number(value) || 0)}%`;
  }

  function formatSeconds(value) {
    return value == null || !Number.isFinite(Number(value)) ? "--" : `${Number(value).toFixed(2)}s`;
  }

  function setPoseStatus(label) {
    if (poseStatusLabel) poseStatusLabel.textContent = label;
  }

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

  function getRoomCode() {
    const fromInput = roomCodeInput ? sanitizeRoomCode(roomCodeInput.value) : "";
    return fromInput || createRoomCode();
  }

  function localGameUrl(options = {}) {
    const params = new URLSearchParams();
    params.set("room", getRoomCode());
    if (options.mirror) params.set("mirror", "1");
    return `/game?${params.toString()}`;
  }

  function applyRoomLinks(info) {
    const room = sanitizeRoomCode(info && info.room) || getRoomCode();
    const links = Array.isArray(info && info.links) ? info.links : [];
    const current = links[0] || { game: localGameUrl(), mirror: localGameUrl({ mirror: true }) };
    const lanLinks = links.filter((item) => item && item.host && !/^localhost(:|$)/i.test(item.host) && !/^127\./.test(item.host));
    const lan = lanLinks[0] || current;

    if (startGameLink) startGameLink.href = current.game || localGameUrl();
    if (mirrorGameLink) mirrorGameLink.href = current.mirror || localGameUrl({ mirror: true });
    if (phoneGameLink) phoneGameLink.href = lan.game || localGameUrl();
    if (roomNetworkHint) {
      const networkLinks = lanLinks.map((item) => item.game).filter(Boolean).join(" | ");
      roomNetworkHint.textContent = networkLinks
        ? `Sala ${room}. Links para celular: ${networkLinks}`
        : `Use o código ${room} no PC e no celular.`;
    }
  }

  async function updateRoomLinks() {
    const room = getRoomCode();
    if (roomCodeInput && roomCodeInput.value !== room) roomCodeInput.value = room;
    localStorage.setItem(ROOM_STORAGE_KEY, room);
    applyRoomLinks({ room });

    try {
      const response = await fetch(`/api/room?room=${encodeURIComponent(room)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("sala indisponível");
      roomInfo = await response.json();
      applyRoomLinks(roomInfo);
    } catch (error) {
      roomInfo = null;
    }
  }

  function resetPoseMetrics(message) {
    if (shoulderTiltMetric) shoulderTiltMetric.textContent = "--";
    if (hipTiltMetric) hipTiltMetric.textContent = "--";
    if (turnBiasMetric) turnBiasMetric.textContent = "--";
    if (centerShiftMetric) centerShiftMetric.textContent = "--";
    if (poseInsight) {
      poseInsight.textContent = message || "Leitura não diagnóstica. Use para observar assimetrias e padrões de movimento.";
    }
  }

  async function checkHealth() {
    if (!dbStatusLabel) return;
    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      const payload = await response.json();
      const provider = payload.database && payload.database.provider ? payload.database.provider : "local";
      dbStatusLabel.textContent = payload.database && payload.database.connected === false ? "fallback" : provider;
    } catch (error) {
      dbStatusLabel.textContent = "offline";
    }
  }

  function resetStats() {
    statAttempts.textContent = "0";
    statAccuracy.textContent = "0%";
    statReaction.textContent = "--";
    statSessions.textContent = "0";
    statsSummary.textContent = "Entre para carregar seus dados.";
  }

  function weakestActionLabel(insights) {
    if (!insights || !insights.byAction) return "sem dados";
    const labels = {
      attack: "ataque",
      dodgeLeft: "desvio para a esquerda",
      dodgeRight: "desvio para a direita",
      duck: "agachar"
    };

    let weakest = null;
    for (const [action, stats] of Object.entries(insights.byAction)) {
      if (!stats || !stats.attempts) continue;
      if (!weakest || stats.accuracy < weakest.stats.accuracy) weakest = { action, stats };
    }

    return weakest ? `${labels[weakest.action] || weakest.action} (${formatPercent(weakest.stats.accuracy)})` : "sem dados";
  }

  async function loadStats() {
    setSessionStatus();
    if (!isSessionReady()) {
      resetStats();
      return;
    }

    statsSummary.textContent = "Carregando estatísticas...";

    try {
      const response = await fetch("/api/history/insights", {
        cache: "no-store",
        headers: authHeaders()
      });

      if (!response.ok) throw new Error("Não foi possível carregar estatísticas.");
      const insights = await response.json();
      const totals = insights.totals || {};

      statAttempts.textContent = String(totals.attempts || 0);
      statAccuracy.textContent = formatPercent(totals.overallAccuracy || 0);
      statReaction.textContent = formatSeconds(totals.overallAvgReaction);
      statSessions.textContent = String(insights.sampleSize || 0);

      if (!insights.sampleSize) {
        statsSummary.textContent = "Sem partidas registradas ainda.";
      } else {
        statsSummary.textContent = `Ponto de atenção: ${weakestActionLabel(insights)}. Última sessão: ${insights.latestEntry ? insights.latestEntry.status : "sem dados"}.`;
      }
    } catch (error) {
      statsSummary.textContent = error.message || "Erro ao carregar estatísticas.";
    }
  }

  function appendChatMessage(role, text) {
    const message = document.createElement("div");
    message.className = `landing-chat-message ${role}`;
    message.textContent = text;
    chatTranscript.appendChild(message);
    chatTranscript.scrollTop = chatTranscript.scrollHeight;
    return message;
  }

  async function askStatsAssistant(question) {
    if (!isSessionReady()) {
      appendChatMessage("assistant", "Entre com seu usuário antes de perguntar sobre estatísticas.");
      return;
    }

    appendChatMessage("user", question);
    const pending = appendChatMessage("assistant", "Lendo suas estatísticas...");

    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ question })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Nao consegui responder agora.");
      pending.textContent = payload.answer || "Nao encontrei uma resposta para esses dados.";
    } catch (error) {
      pending.textContent = error.message || "Erro no chat.";
    }
  }

  function stopCamera() {
    if (cameraFrameId) cancelAnimationFrame(cameraFrameId);
    cameraFrameId = 0;
    previousMotionFrame = null;
    lastPoseVideoTime = -1;

    if (cameraStream) {
      for (const track of cameraStream.getTracks()) track.stop();
      cameraStream = null;
    }

    if (cameraPreview) cameraPreview.srcObject = null;
    if (cameraStateLabel) cameraStateLabel.textContent = "desligada";
    if (cameraHint) cameraHint.textContent = "câmera desligada";
    if (cameraCtx) {
      cameraCtx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);
      cameraCtx.fillStyle = "#070d12";
      cameraCtx.fillRect(0, 0, cameraCanvas.width, cameraCanvas.height);
    }
    motionMetric.textContent = "0%";
    motionXMetric.textContent = "0.00";
    motionYMetric.textContent = "0.00";
    setPoseStatus("pose offline");
    resetPoseMetrics();
  }

  async function ensurePoseLandmarker() {
    if (poseLandmarker) return poseLandmarker;
    if (poseLoading) {
      while (poseLoading && !poseLandmarker) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      return poseLandmarker;
    }

    poseLoading = true;
    setPoseStatus("carregando pose");

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
        minPoseDetectionConfidence: 0.58,
        minPosePresenceConfidence: 0.58,
        minTrackingConfidence: 0.58
      });

      setPoseStatus("pose ativa");
      return poseLandmarker;
    } catch (error) {
      setPoseStatus("pose indisponível");
      resetPoseMetrics("Nao consegui carregar o modelo de pose. O tracking simples de movimento continua ativo.");
      throw error;
    } finally {
      poseLoading = false;
    }
  }

  function landmarkOk(point) {
    return point && (point.visibility == null || point.visibility > 0.45);
  }

  function poseQuality(landmarks) {
    const required = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    const visible = required.filter((index) => landmarkOk(landmarks[index])).length;
    return visible / required.length;
  }

  function drawPoseLandmarks(landmarks, width, height) {
    if (!Array.isArray(landmarks) || landmarks.length === 0) return;

    cameraCtx.save();
    cameraCtx.lineWidth = 4;
    cameraCtx.strokeStyle = "#f28c28";
    cameraCtx.fillStyle = "#ffe8b6";

    for (const [from, to] of POSE_CONNECTIONS) {
      const a = landmarks[from];
      const b = landmarks[to];
      if (!landmarkOk(a) || !landmarkOk(b)) continue;
      cameraCtx.beginPath();
      cameraCtx.moveTo(a.x * width, a.y * height);
      cameraCtx.lineTo(b.x * width, b.y * height);
      cameraCtx.stroke();
    }

    for (const index of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]) {
      const point = landmarks[index];
      if (!landmarkOk(point)) continue;
      cameraCtx.beginPath();
      cameraCtx.arc(point.x * width, point.y * height, index === 0 ? 5 : 4, 0, Math.PI * 2);
      cameraCtx.fill();
    }

    cameraCtx.restore();
  }

  function mirrorLandmarks(landmarks) {
    if (!MIRROR_CAMERA || !Array.isArray(landmarks)) return landmarks;
    return landmarks.map((point) => point ? { ...point, x: 1 - point.x } : point);
  }

  function drawCameraFrame(targetCtx, width, height) {
    if (!MIRROR_CAMERA) {
      targetCtx.drawImage(cameraPreview, 0, 0, width, height);
      return;
    }

    targetCtx.save();
    targetCtx.translate(width, 0);
    targetCtx.scale(-1, 1);
    targetCtx.drawImage(cameraPreview, 0, 0, width, height);
    targetCtx.restore();
  }

  function signedDegreesBetween(a, b) {
    if (!a || !b) return null;
    return Math.atan2((b.y - a.y), (b.x - a.x)) * 180 / Math.PI;
  }

  function describeTilt(degrees) {
    if (degrees == null || !Number.isFinite(degrees)) return "--";
    const abs = Math.abs(degrees);
    if (abs < 2) return "neutro";
    return `${abs.toFixed(1)} ${degrees > 0 ? "dir" : "esq"}`;
  }

  function describeCenter(value) {
    if (!Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    if (abs < 0.06) return "central";
    return `${abs.toFixed(2)} ${value > 0 ? "dir" : "esq"}`;
  }

  function analyzePose(landmarks) {
    const leftShoulder = landmarks[11];
    const rightShoulder = landmarks[12];
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const nose = landmarks[0];

    const hasTorso = [leftShoulder, rightShoulder, leftHip, rightHip].every(landmarkOk);
    const quality = poseQuality(landmarks);
    setPoseStatus(`pose ${Math.round(quality * 100)}%`);

    if (!hasTorso) {
      resetPoseMetrics("Aproxime-se da camera ate ombros e quadril ficarem visiveis.");
      return;
    }

    const shoulderTilt = signedDegreesBetween(leftShoulder, rightShoulder);
    const hipTilt = signedDegreesBetween(leftHip, rightHip);
    const shoulderCenter = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2
    };
    const hipCenter = {
      x: (leftHip.x + rightHip.x) / 2,
      y: (leftHip.y + rightHip.y) / 2
    };
    const bodyCenterX = (shoulderCenter.x + hipCenter.x) / 2;
    const centerShift = (bodyCenterX - 0.5) * 2;
    const headOffset = landmarkOk(nose) ? (nose.x - shoulderCenter.x) * 2 : 0;

    const tiltAverage = (Math.abs(shoulderTilt || 0) + Math.abs(hipTilt || 0)) / 2;
    let tendency = "neutra";
    if (Math.abs(centerShift) > 0.08) tendency = centerShift > 0 ? "direita" : "esquerda";
    else if (Math.abs(headOffset) > 0.08) tendency = headOffset > 0 ? "cabeca dir" : "cabeca esq";

    shoulderTiltMetric.textContent = describeTilt(shoulderTilt);
    hipTiltMetric.textContent = describeTilt(hipTilt);
    turnBiasMetric.textContent = tendency;
    centerShiftMetric.textContent = describeCenter(centerShift);

    if (quality < 0.72) {
      poseInsight.textContent = "Registro parcial do corpo. Afaste a camera ate cabeca, maos, quadril e joelhos ficarem no quadro.";
    } else if (tiltAverage > 8 || Math.abs(centerShift) > 0.18 || Math.abs(headOffset) > 0.16) {
      poseInsight.textContent = "Assimetria perceptível neste frame. Observe se o padrão se repete em várias tentativas; isso não substitui avaliação profissional.";
    } else if (tiltAverage > 4 || Math.abs(centerShift) > 0.10) {
      poseInsight.textContent = "Pequena tendência corporal detectada. Bom para calibrar postura antes do jogo.";
    } else {
      poseInsight.textContent = "Postura parece relativamente central neste momento.";
    }
  }

  function detectPose(width, height) {
    if (!poseMirrorEnabled || !poseLandmarker || !cameraPreview.videoWidth) return;
    if (cameraPreview.currentTime === lastPoseVideoTime) return;
    lastPoseVideoTime = cameraPreview.currentTime;

    const result = poseLandmarker.detectForVideo(cameraPreview, performance.now());
    const landmarks = mirrorLandmarks(result && result.landmarks && result.landmarks[0]);
    if (!landmarks) {
      resetPoseMetrics("Nenhum corpo detectado. Fique de frente para a camera.");
      return;
    }

    drawPoseLandmarks(landmarks, width, height);
    analyzePose(landmarks);
  }

  function updateMotionFrame() {
    if (!cameraStream || !cameraPreview || !cameraCtx || !motionCtx || !cameraPreview.videoWidth) {
      cameraFrameId = requestAnimationFrame(updateMotionFrame);
      return;
    }

    const width = cameraCanvas.width;
    const height = cameraCanvas.height;
    if (motionCanvas.width !== width || motionCanvas.height !== height) {
      motionCanvas.width = width;
      motionCanvas.height = height;
    }

    drawCameraFrame(motionCtx, width, height);

    const image = motionCtx.getImageData(0, 0, width, height);
    const data = image.data;
    const current = new Uint8Array(width * height);
    let count = 0;
    let sumX = 0;
    let sumY = 0;

    for (let y = 0; y < height; y += 3) {
      for (let x = 0; x < width; x += 3) {
        const pixel = (y * width + x) * 4;
        const gray = (data[pixel] * 0.299 + data[pixel + 1] * 0.587 + data[pixel + 2] * 0.114) | 0;
        const index = y * width + x;
        current[index] = gray;

        if (previousMotionFrame && Math.abs(gray - previousMotionFrame[index]) > 34) {
          count += 1;
          sumX += x;
          sumY += y;
        }
      }
    }

    previousMotionFrame = current;
    const samples = (width / 3) * (height / 3);
    const energy = Math.min(1, count / Math.max(1, samples * 0.18));
    const hasMotion = count > 18;
    const normalizedX = hasMotion ? ((sumX / count) / width - 0.5) * 2 : 0;
    const normalizedY = hasMotion ? (0.5 - (sumY / count) / height) * 2 : 0;

    drawCameraFrame(cameraCtx, width, height);
    cameraCtx.fillStyle = "rgba(7, 8, 9, 0.18)";
    cameraCtx.fillRect(0, 0, width, height);
    cameraCtx.strokeStyle = "rgba(242, 140, 40, 0.22)";
    cameraCtx.lineWidth = 1;
    for (let x = 0; x <= width; x += 40) {
      cameraCtx.beginPath();
      cameraCtx.moveTo(x, 0);
      cameraCtx.lineTo(x, height);
      cameraCtx.stroke();
    }
    for (let y = 0; y <= height; y += 40) {
      cameraCtx.beginPath();
      cameraCtx.moveTo(0, y);
      cameraCtx.lineTo(width, y);
      cameraCtx.stroke();
    }

    if (hasMotion) {
      const cx = sumX / count;
      const cy = sumY / count;
      cameraCtx.strokeStyle = energy > 0.42 ? "#ffe8b6" : "#f28c28";
      cameraCtx.lineWidth = 4;
      cameraCtx.beginPath();
      cameraCtx.arc(cx, cy, 20 + energy * 28, 0, Math.PI * 2);
      cameraCtx.stroke();
    }

    detectPose(width, height);

    motionMetric.textContent = `${Math.round(energy * 100)}%`;
    motionXMetric.textContent = normalizedX.toFixed(2);
    motionYMetric.textContent = normalizedY.toFixed(2);

    cameraFrameId = requestAnimationFrame(updateMotionFrame);
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (cameraHint) cameraHint.textContent = "câmera indisponível";
      return false;
    }

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 960 },
          height: { ideal: 540 },
          facingMode: "user"
        }
      });
      cameraPreview.srcObject = cameraStream;
      await cameraPreview.play();
      cameraStateLabel.textContent = "ligada";
      cameraHint.textContent = poseMirrorEnabled ? "espelho IA ativo" : "simulação de movimento";
      updateMotionFrame();
      return true;
    } catch (error) {
      cameraHint.textContent = "permissao negada";
      cameraStateLabel.textContent = "erro";
      return false;
    }
  }

  function bindEvents() {
    if (cameraToggleButton) {
      cameraToggleButton.addEventListener("click", () => {
        if (cameraStream) stopCamera();
        else startCamera();
      });
    }

    if (poseMirrorButton) {
      poseMirrorButton.addEventListener("click", async () => {
        poseMirrorEnabled = !poseMirrorEnabled;
        poseMirrorButton.textContent = poseMirrorEnabled ? "Desativar espelho IA" : "Ativar espelho IA";

        if (!poseMirrorEnabled) {
          setPoseStatus("pose offline");
          resetPoseMetrics();
          if (cameraHint) cameraHint.textContent = cameraStream ? "simulação de movimento" : "câmera desligada";
          return;
        }

        try {
          if (!cameraStream) {
            const cameraReady = await startCamera();
            if (!cameraReady) throw new Error("câmera indisponível");
          }
          await ensurePoseLandmarker();
          if (cameraHint) cameraHint.textContent = "espelho IA ativo";
        } catch (error) {
          poseMirrorEnabled = false;
          poseMirrorButton.textContent = "Ativar espelho IA";
          setPoseStatus("pose indisponível");
        }
      });
    }

    if (roomCodeInput) {
      roomCodeInput.addEventListener("input", () => {
        roomCodeInput.value = sanitizeRoomCode(roomCodeInput.value);
        updateRoomLinks();
      });
    }

    if (roomGenerateButton) {
      roomGenerateButton.addEventListener("click", () => {
        if (roomCodeInput) roomCodeInput.value = createRoomCode();
        updateRoomLinks();
      });
    }

    if (refreshStatsButton) refreshStatsButton.addEventListener("click", loadStats);

    if (statsChatForm) {
      statsChatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const question = statsChatInput.value.trim();
        if (!question) return;
        statsChatInput.value = "";
        askStatsAssistant(question);
      });
    }

    window.addEventListener("auth-state-change", loadStats);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindEvents();
    const savedRoom = sanitizeRoomCode(new URLSearchParams(window.location.search).get("room"))
      || sanitizeRoomCode(localStorage.getItem(ROOM_STORAGE_KEY))
      || createRoomCode();
    if (roomCodeInput) roomCodeInput.value = savedRoom;
    updateRoomLinks();
    setSessionStatus();
    checkHealth();
    loadStats();
    stopCamera();
  });
})();
