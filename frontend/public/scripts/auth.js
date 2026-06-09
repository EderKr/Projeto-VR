const AUTH_TOKEN_KEY = "hb_auth_token";
const AUTH_USER_KEY = "hb_auth_user";

const authState = {
  token: localStorage.getItem(AUTH_TOKEN_KEY) || "",
  user: null
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

function setAuthMessage(message, type = "info") {
  const messageEl = document.getElementById("loginMessage");
  if (!messageEl) return;
  messageEl.textContent = message || "";
  messageEl.dataset.type = type;
}

function updateAuthUI() {
  const overlay = document.getElementById("loginOverlay");
  const userBadge = document.getElementById("userBadge");
  const startHint = document.getElementById("loginStartHint");
  const logoutButton = document.getElementById("logoutButton");

  if (overlay) {
    overlay.classList.toggle("hidden", isLoggedIn());
    overlay.setAttribute("aria-hidden", String(isLoggedIn()));
  }

  if (userBadge) {
    userBadge.style.display = isLoggedIn() ? "flex" : "none";
    userBadge.textContent = isLoggedIn() ? `Jogador: ${authState.user.displayName || authState.user.username}` : "";
  }

  if (logoutButton) {
    logoutButton.style.display = isLoggedIn() ? "block" : "none";
  }

  if (startHint) {
    startHint.textContent = isLoggedIn()
      ? "Login confirmado. Você já pode iniciar o jogo."
      : "Faça login ou crie uma conta para iniciar e salvar seu histórico.";
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

async function submitAuth(mode) {
  const usernameEl = document.getElementById("loginUsername");
  const passwordEl = document.getElementById("loginPassword");
  const genderEl = document.getElementById("loginGender");
  const username = usernameEl ? usernameEl.value.trim() : "";
  const password = passwordEl ? passwordEl.value : "";
  const gender = genderEl && genderEl.value === "female" ? "female" : "male";

  if (!username || !password) {
    setAuthMessage("Preencha usuário e senha.", "error");
    return;
  }

  setAuthMessage(mode === "register" ? "Criando conta..." : "Entrando...", "info");

  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "register" ? { username, password, gender } : { username, password })
    });

    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(parsed.error || "Não foi possível autenticar.");
    }

    saveAuthSession(parsed);
    setAuthMessage("Login confirmado. Histórico individual ativo.", "success");

    if (typeof initializePerformanceHistory === "function") {
      await initializePerformanceHistory();
    }
  } catch (error) {
    setAuthMessage(error.message || "Erro de autenticação.", "error");
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

    if (!response.ok) throw new Error("Sessão expirada.");
    const parsed = await response.json();
    authState.user = parsed.user;
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authState.user));
    updateAuthUI();
    if (typeof initializePerformanceHistory === "function") {
      await initializePerformanceHistory();
    }
  } catch (error) {
    clearAuthSession();
    setAuthMessage("Faça login para carregar seu histórico.", "info");
  }
}

function requireAuthBeforeStart() {
  if (isLoggedIn()) return true;
  updateAuthUI();
  setAuthMessage("Faça login antes de iniciar o jogo.", "error");
  return false;
}

window.getAuthHeaders = getAuthHeaders;
window.isLoggedIn = isLoggedIn;
window.requireAuthBeforeStart = requireAuthBeforeStart;
window.authState = authState;

document.addEventListener("DOMContentLoaded", () => {
  const loginButton = document.getElementById("loginButton");
  const registerButton = document.getElementById("registerButton");
  const logoutButton = document.getElementById("logoutButton");
  const form = document.getElementById("loginForm");

  if (loginButton) {
    loginButton.addEventListener("click", (event) => {
      event.preventDefault();
      submitAuth("login");
    });
  }
  if (registerButton) registerButton.addEventListener("click", () => submitAuth("register"));
  if (logoutButton) logoutButton.addEventListener("click", clearAuthSession);
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitAuth("login");
    });
  }

  updateAuthUI();
  void validateStoredSession();
});
