const AUTH_TOKEN_KEY = "hb_auth_token";
const AUTH_USER_KEY = "hb_auth_user";

const authState = {
  token: localStorage.getItem(AUTH_TOKEN_KEY) || "",
  user: null,
  mode: "login",
  canCreateFirstAdmin: false
};

try {
  const rawUser = localStorage.getItem(AUTH_USER_KEY);
  authState.user = rawUser ? JSON.parse(rawUser) : null;
} catch (error) {
  authState.user = null;
}

function getAuthHeaders(extra = {}) {
  return authState.token
    ? { ...extra, Authorization: `Bearer ${authState.token}` }
    : { ...extra };
}

function isLoggedIn() {
  return Boolean(authState.token && authState.user);
}

function isAdmin() {
  return isLoggedIn() && authState.user.role === "admin";
}

function setAuthMessage(message, type = "info") {
  const messageEl = document.getElementById("loginMessage");
  if (!messageEl) return;
  messageEl.textContent = message || "";
  messageEl.dataset.type = type;
}

function getInviteFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("invite") || "";
}

function setAuthMode(mode) {
  authState.mode = mode === "register" ? "register" : "login";
  const isRegister = authState.mode === "register";
  const bootstrapAdmin = isRegister && authState.canCreateFirstAdmin && !getInviteFromUrl();
  document.body.classList.toggle("auth-register-mode", isRegister);

  document.querySelectorAll(".register-only").forEach((element) => {
    element.hidden = !isRegister;
    element.querySelectorAll("input, select").forEach((field) => {
      field.required = isRegister && field.dataset.required === "true";
    });
  });

  const emailEl = document.getElementById("loginEmail");
  const passwordEl = document.getElementById("loginPassword");
  const titleEl = document.getElementById("authTitle");
  const submitEl = document.getElementById("loginButton");
  const toggleEl = document.getElementById("registerButton");
  const inviteEl = document.getElementById("registerInvite");

  if (emailEl) emailEl.autocomplete = isRegister ? "email" : "username";
  if (passwordEl) passwordEl.autocomplete = isRegister ? "new-password" : "current-password";
  if (titleEl) titleEl.textContent = isRegister ? "Criar conta por convite" : "Entrar";
  if (submitEl) submitEl.textContent = isRegister ? "Criar conta" : "Entrar";
  if (toggleEl) toggleEl.textContent = isRegister ? "Ja tenho conta" : (authState.canCreateFirstAdmin ? "Criar primeiro ADM" : "Usar convite");
  if (inviteEl && !inviteEl.value) inviteEl.value = getInviteFromUrl();
  if (inviteEl) {
    inviteEl.disabled = bootstrapAdmin;
    inviteEl.placeholder = bootstrapAdmin ? "dispensado para o primeiro ADM" : "codigo do convite";
  }

  setAuthMessage(
    isRegister
      ? (bootstrapAdmin ? "Como ainda nao ha usuarios, esta primeira conta sera ADM." : "Use o link de convite recebido para criar sua conta.")
      : "Entre com seu e-mail e senha.",
    "info"
  );
}

function updateAuthUI() {
  const overlay = document.getElementById("loginOverlay");
  const userBadge = document.getElementById("userBadge");
  const startHint = document.getElementById("loginStartHint");
  const logoutButton = document.getElementById("logoutButton");
  const adminLink = document.getElementById("adminLink");

  if (overlay) {
    overlay.classList.toggle("hidden", isLoggedIn());
    overlay.setAttribute("aria-hidden", String(isLoggedIn()));
  }

  if (userBadge) {
    userBadge.style.display = isLoggedIn() ? "flex" : "none";
    userBadge.textContent = isLoggedIn() ? `${isAdmin() ? "ADM" : "Jogador"}: ${authState.user.displayName || authState.user.email}` : "";
  }

  if (logoutButton) {
    logoutButton.style.display = isLoggedIn() ? "block" : "none";
  }

  if (adminLink) {
    adminLink.style.display = isAdmin() ? "inline-flex" : "none";
  }

  if (startHint) {
    startHint.textContent = isLoggedIn()
      ? "Login confirmado. Voce ja pode iniciar o jogo."
      : "Entre com sua conta ou use um convite para se cadastrar.";
  }

  window.dispatchEvent(new CustomEvent("auth-state-change", {
    detail: {
      loggedIn: isLoggedIn(),
      user: authState.user
    }
  }));
}

function saveAuthSession(payload) {
  authState.token = payload.token;
  authState.user = payload.user;
  localStorage.setItem(AUTH_TOKEN_KEY, authState.token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authState.user));
  updateAuthUI();
}

function clearAuthSession() {
  authState.token = "";
  authState.user = null;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  updateAuthUI();
  if (typeof resetGame === "function") resetGame();
  if (typeof renderPerformanceHistory === "function") renderPerformanceHistory();
}

function getFieldValue(id) {
  const element = document.getElementById(id);
  return element ? element.value.trim() : "";
}

function getRegisterPayload() {
  return {
    inviteToken: getFieldValue("registerInvite"),
    name: getFieldValue("registerName"),
    email: getFieldValue("loginEmail"),
    age: Number(getFieldValue("registerAge")),
    sex: getFieldValue("registerSex"),
    password: getFieldValue("loginPassword"),
    confirmPassword: getFieldValue("registerConfirmPassword")
  };
}

function getLoginPayload() {
  return {
    username: getFieldValue("loginEmail"),
    password: getFieldValue("loginPassword")
  };
}

async function submitAuth(mode = authState.mode) {
  const isRegister = mode === "register";
  const payload = isRegister ? getRegisterPayload() : getLoginPayload();
  const bootstrapAdmin = isRegister && authState.canCreateFirstAdmin && !getInviteFromUrl();

  if (!payload.email && !payload.username) {
    setAuthMessage("Preencha o e-mail.", "error");
    return;
  }
  if (!payload.password) {
    setAuthMessage("Preencha a senha.", "error");
    return;
  }
  if (isRegister && !payload.inviteToken && !bootstrapAdmin) {
    setAuthMessage("Use um link de convite valido para se cadastrar.", "error");
    return;
  }

  setAuthMessage(isRegister ? "Criando conta..." : "Entrando...", "info");

  try {
    const response = await fetch(`/api/auth/${isRegister ? "register" : "login"}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(parsed.error || "Nao foi possivel autenticar.");
    }

    saveAuthSession(parsed);
    setAuthMessage("Login confirmado. Historico individual ativo.", "success");

    if (typeof initializePerformanceHistory === "function") {
      await initializePerformanceHistory();
    }
  } catch (error) {
    setAuthMessage(error.message || "Erro de autenticacao.", "error");
  }
}

async function validateStoredSession() {
  if (!authState.token) {
    updateAuthUI();
    return;
  }

  try {
    const response = await fetch("/api/auth/me", {
      headers: getAuthHeaders(),
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Sessao expirada.");
    const parsed = await response.json();
    authState.user = parsed.user;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authState.user));
    updateAuthUI();
    if (typeof initializePerformanceHistory === "function") {
      await initializePerformanceHistory();
    }
  } catch (error) {
    clearAuthSession();
    setAuthMessage("Faca login para carregar seu historico.", "info");
  }
}

async function loadBootstrapStatus() {
  try {
    const response = await fetch("/api/auth/bootstrap", { cache: "no-store" });
    if (!response.ok) return;
    const parsed = await response.json();
    authState.canCreateFirstAdmin = Boolean(parsed.canCreateFirstAdmin);
  } catch (error) {
    authState.canCreateFirstAdmin = false;
  }
}

function requireAuthBeforeStart() {
  if (isLoggedIn()) return true;
  updateAuthUI();
  setAuthMessage("Faca login antes de iniciar o jogo.", "error");
  return false;
}

window.getAuthHeaders = getAuthHeaders;
window.isLoggedIn = isLoggedIn;
window.isAdmin = isAdmin;
window.requireAuthBeforeStart = requireAuthBeforeStart;
window.authState = authState;

document.addEventListener("DOMContentLoaded", async () => {
  const loginButton = document.getElementById("loginButton");
  const registerButton = document.getElementById("registerButton");
  const logoutButton = document.getElementById("logoutButton");
  const form = document.getElementById("loginForm");
  const inviteToken = getInviteFromUrl();

  await loadBootstrapStatus();

  if (inviteToken || authState.canCreateFirstAdmin) setAuthMode("register");
  else setAuthMode("login");

  if (loginButton) {
    loginButton.addEventListener("click", (event) => {
      event.preventDefault();
      submitAuth(authState.mode);
    });
  }
  if (registerButton) {
    registerButton.addEventListener("click", () => setAuthMode(authState.mode === "register" ? "login" : "register"));
  }
  if (logoutButton) logoutButton.addEventListener("click", clearAuthSession);
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitAuth(authState.mode);
    });
  }

  updateAuthUI();
  void validateStoredSession();
});
