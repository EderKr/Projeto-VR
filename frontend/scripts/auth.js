const AUTH_TOKEN_KEY = "hb_auth_token";
const AUTH_USER_KEY = "hb_auth_user";

const authState = {
  token: localStorage.getItem(AUTH_TOKEN_KEY) || "",
  user: null,
  mode: "login",
  canCreateFirstGod: false
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
  return isLoggedIn() && (authState.user.role === "admin" || authState.user.role === "god");
}

function isGod() {
  return isLoggedIn() && authState.user.role === "god";
}

function setAuthMessage(message, type = "info") {
  const messageEl = document.getElementById("loginMessage") || document.getElementById("accountMessage");
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
  const bootstrapGod = isRegister && authState.canCreateFirstGod && !getInviteFromUrl();
  document.body.classList.toggle("auth-register-mode", isRegister);

  document.querySelectorAll(".register-only").forEach((element) => {
    element.hidden = !isRegister;
    element.querySelectorAll("input, select").forEach((field) => {
      field.required = isRegister && field.dataset.required === "true";
    });
  });

  const emailEl = document.getElementById("loginEmail");
  const emailLabelEl = document.getElementById("loginEmailLabel");
  const passwordEl = document.getElementById("loginPassword");
  const titleEl = document.getElementById("authTitle");
  const submitEl = document.getElementById("loginButton");
  const toggleEl = document.getElementById("registerButton");
  const inviteEl = document.getElementById("registerInvite");

  if (emailEl) {
    emailEl.type = "email";
    emailEl.autocomplete = "email";
    emailEl.placeholder = isRegister ? "voce@email.com" : "seu@email.com";
  }
  if (emailLabelEl) emailLabelEl.textContent = "E-mail";
  if (passwordEl) passwordEl.autocomplete = isRegister ? "new-password" : "current-password";
  if (titleEl) titleEl.textContent = isRegister ? (bootstrapGod ? "Criar conta Deus" : "Criar conta por convite") : "Entrar";
  if (submitEl) submitEl.textContent = isRegister ? "Criar conta" : "Entrar";
  if (toggleEl) {
    toggleEl.hidden = false;
    toggleEl.textContent = isRegister ? "Já tenho conta" : (authState.canCreateFirstGod ? "Criar conta Deus" : "Usar convite");
  }
  if (inviteEl && !inviteEl.value) inviteEl.value = getInviteFromUrl();
  if (inviteEl) {
    inviteEl.disabled = bootstrapGod;
    inviteEl.placeholder = bootstrapGod ? "dispensado para a primeira conta Deus" : "código do convite";
  }

  updateRegisterAgePreview();

  setAuthMessage(
    isRegister
      ? (bootstrapGod ? "Como ainda não há conta Deus, esta conta será criada como Deus." : "Use o link de convite recebido para criar sua conta.")
      : "Entre com seu e-mail e senha.",
    "info"
  );
}

function calculateAgeFromBirthDate(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [year, month, day] = raw.split("-").map(Number);
  const today = new Date();
  let age = today.getFullYear() - year;
  const hadBirthdayThisYear =
    today.getMonth() + 1 > month
    || (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hadBirthdayThisYear) age -= 1;
  return Number.isFinite(age) && age >= 0 ? age : null;
}

function formatAgeLabel(user = {}) {
  const birthAge = calculateAgeFromBirthDate(user.birthDate);
  const age = birthAge == null ? user.age : birthAge;
  return age == null || Number.isNaN(Number(age)) ? "--" : `${age} anos`;
}

function updateRegisterAgePreview() {
  const birthDateEl = document.getElementById("registerBirthDate");
  const agePreviewEl = document.getElementById("registerAgePreview");
  if (!birthDateEl || !agePreviewEl) return;

  const age = calculateAgeFromBirthDate(birthDateEl.value);
  agePreviewEl.textContent = age == null ? "--" : `${age} anos`;
}

function updateAccountPage() {
  const loggedInEl = document.getElementById("accountLoggedIn");
  const loggedOutEl = document.getElementById("accountLoggedOut");
  const emailEl = document.getElementById("accountEmail");
  const ageEl = document.getElementById("accountAge");
  const nameEl = document.getElementById("accountDisplayName");
  const birthDateEl = document.getElementById("accountBirthDate");

  if (!loggedInEl && !loggedOutEl) return;

  if (loggedInEl) loggedInEl.hidden = !isLoggedIn();
  if (loggedOutEl) loggedOutEl.hidden = isLoggedIn();

  if (!isLoggedIn()) {
    if (document.body.classList.contains("account-page")) {
      window.location.replace("/");
    }
    return;
  }

  if (emailEl) emailEl.textContent = authState.user.email || authState.user.username || "--";
  if (ageEl) ageEl.textContent = formatAgeLabel(authState.user);
  if (nameEl) nameEl.value = authState.user.displayName || "";
  if (birthDateEl) birthDateEl.value = authState.user.birthDate || "";
}

function updateAuthUI() {
  const overlay = document.getElementById("loginOverlay");
  const userBadge = document.getElementById("userBadge");
  const startHint = document.getElementById("loginStartHint");
  const logoutButton = document.getElementById("logoutButton");
  const deleteAccountButton = document.getElementById("deleteAccountButton");
  const adminLink = document.getElementById("adminLink");

  if (overlay) {
    overlay.classList.toggle("hidden", isLoggedIn());
    overlay.setAttribute("aria-hidden", String(isLoggedIn()));
  }

  if (userBadge) {
    userBadge.style.display = isLoggedIn() ? "flex" : "none";
    userBadge.textContent = isLoggedIn() ? `${isGod() ? "Deus" : (isAdmin() ? "ADM" : "Jogador")}: ${authState.user.displayName || authState.user.email}` : "";
  }

  if (logoutButton) {
    logoutButton.style.display = isLoggedIn() ? "inline-flex" : "none";
  }

  if (deleteAccountButton) {
    deleteAccountButton.style.display = isLoggedIn() ? "inline-flex" : "none";
  }

  if (adminLink) {
    adminLink.style.display = isAdmin() ? "inline-flex" : "none";
  }

  if (startHint) {
    startHint.textContent = isLoggedIn()
      ? "Login confirmado. Você já pode iniciar o jogo."
      : "Entre com sua conta ou use um convite para se cadastrar.";
  }

  updateAccountPage();

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

async function deleteOwnAccount() {
  if (!isLoggedIn()) {
    setAuthMessage("Entre antes de apagar a conta.", "error");
    return;
  }

  const confirmed = window.confirm("Apagar sua conta também remove seu histórico. Esta ação não pode ser desfeita.");
  if (!confirmed) return;

  const password = window.prompt("Digite sua senha para confirmar a exclusão da conta:");
  if (!password) {
    setAuthMessage("Exclusão cancelada.", "info");
    return;
  }

  try {
    const response = await fetch("/api/auth/me", {
      method: "DELETE",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ password })
    });
    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(parsed.error || "Não foi possível apagar a conta.");
    }

    clearAuthSession();
    setAuthMessage("Conta apagada com sucesso.", "success");
  } catch (error) {
    setAuthMessage(error.message || "Erro ao apagar conta.", "error");
  }
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
    birthDate: getFieldValue("registerBirthDate"),
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
  const bootstrapGod = isRegister && authState.canCreateFirstGod && !getInviteFromUrl();

  if (!payload.email && !payload.username) {
    setAuthMessage("Preencha o e-mail.", "error");
    return;
  }
  if (!payload.password) {
    setAuthMessage("Preencha a senha.", "error");
    return;
  }
  if (isRegister && !payload.inviteToken && !bootstrapGod) {
    setAuthMessage("Use um link de convite valido para se cadastrar.", "error");
    return;
  }
  if (isRegister && !payload.birthDate) {
    setAuthMessage("Informe sua data de nascimento.", "error");
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

async function submitAccountProfile() {
  if (!isLoggedIn()) {
    setAuthMessage("Entre antes de alterar a conta.", "error");
    return;
  }

  const displayName = getFieldValue("accountDisplayName");
  const birthDate = getFieldValue("accountBirthDate");

  if (displayName.length < 2) {
    setAuthMessage("Informe um nome com pelo menos 2 caracteres.", "error");
    return;
  }

  setAuthMessage("Salvando conta...", "info");

  try {
    const response = await fetch("/api/auth/me", {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ displayName, birthDate })
    });
    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(parsed.error || "Nao foi possivel atualizar a conta.");
    }

    saveAuthSession(parsed);
    setAuthMessage("Conta atualizada com sucesso.", "success");
  } catch (error) {
    setAuthMessage(error.message || "Erro ao atualizar conta.", "error");
  }
}

async function submitPasswordChange() {
  if (!isLoggedIn()) {
    setAuthMessage("Entre antes de alterar a senha.", "error");
    return;
  }

  const currentPassword = getFieldValue("accountCurrentPassword");
  const newPassword = getFieldValue("accountNewPassword");
  const confirmPassword = getFieldValue("accountConfirmPassword");

  if (!currentPassword || !newPassword || !confirmPassword) {
    setAuthMessage("Preencha todos os campos de senha.", "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    setAuthMessage("A confirmacao da nova senha nao confere.", "error");
    return;
  }

  setAuthMessage("Atualizando senha...", "info");

  try {
    const response = await fetch("/api/auth/me/password", {
      method: "PATCH",
      headers: getAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
    });
    const parsed = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(parsed.error || "Nao foi possivel atualizar a senha.");
    }

    const form = document.getElementById("accountPasswordForm");
    if (form) form.reset();
    setAuthMessage("Senha atualizada com sucesso.", "success");
  } catch (error) {
    setAuthMessage(error.message || "Erro ao atualizar senha.", "error");
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

async function loadBootstrapStatus() {
  try {
    const response = await fetch("/api/auth/bootstrap", { cache: "no-store" });
    if (!response.ok) return;
    const parsed = await response.json();
    authState.canCreateFirstGod = Boolean(parsed.canCreateFirstGod);
  } catch (error) {
    authState.canCreateFirstGod = false;
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
window.isAdmin = isAdmin;
window.isGod = isGod;
window.requireAuthBeforeStart = requireAuthBeforeStart;
window.authState = authState;

document.addEventListener("DOMContentLoaded", async () => {
  const loginButton = document.getElementById("loginButton");
  const registerButton = document.getElementById("registerButton");
  const logoutButton = document.getElementById("logoutButton");
  const deleteAccountButton = document.getElementById("deleteAccountButton");
  const accountProfileForm = document.getElementById("accountProfileForm");
  const accountPasswordForm = document.getElementById("accountPasswordForm");
  const accountBirthDate = document.getElementById("accountBirthDate");
  const accountAge = document.getElementById("accountAge");
  const registerBirthDate = document.getElementById("registerBirthDate");
  const form = document.getElementById("loginForm");
  const inviteToken = getInviteFromUrl();

  await loadBootstrapStatus();

  if (inviteToken || authState.canCreateFirstGod) setAuthMode("register");
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
  if (deleteAccountButton) deleteAccountButton.addEventListener("click", deleteOwnAccount);
  if (accountProfileForm) {
    accountProfileForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitAccountProfile();
    });
  }
  if (accountPasswordForm) {
    accountPasswordForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitPasswordChange();
    });
  }
  if (accountBirthDate && accountAge) {
    accountBirthDate.addEventListener("input", () => {
      const age = calculateAgeFromBirthDate(accountBirthDate.value);
      accountAge.textContent = age == null ? "--" : `${age} anos`;
    });
  }
  if (registerBirthDate) {
    registerBirthDate.addEventListener("input", updateRegisterAgePreview);
  }
  if (form) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitAuth(authState.mode);
    });
  }

  updateAuthUI();
  void validateStoredSession();
});
