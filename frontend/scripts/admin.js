const adminState = {
  loading: false,
  openPerformanceUserId: null
};

const ADMIN_ACTION_LABELS = {
  attack: "ataque",
  dodgeLeft: "desvio esquerda",
  dodgeRight: "desvio direita",
  duck: "agachar",
  jump: "pular"
};

function setAdminMessage(message, type = "info") {
  const element = document.getElementById("adminMessage");
  if (!element) return;
  element.textContent = message || "";
  element.dataset.type = type;
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "--";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatSeconds(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${numberValue.toFixed(2)}s` : "--";
}

function formatPercent(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? `${numberValue.toFixed(1)}%` : "--";
}

function actionLabel(value) {
  return ADMIN_ACTION_LABELS[value] || String(value || "--");
}

function calculatePerformanceTotals(history = []) {
  let attempts = 0;
  let hits = 0;
  let misses = 0;
  let reactionWeight = 0;
  let reactionTotal = 0;

  for (const item of history) {
    const itemAttempts = Math.max(0, Number(item.attempts) || 0);
    const itemHits = Math.max(0, Number(item.hits) || 0);
    const itemMisses = Math.max(0, Number(item.misses) || 0);
    attempts += itemAttempts;
    hits += itemHits;
    misses += itemMisses;

    if (Number.isFinite(Number(item.avgReaction))) {
      const weight = itemHits > 0 ? itemHits : 1;
      reactionWeight += weight;
      reactionTotal += Number(item.avgReaction) * weight;
    }
  }

  return {
    attempts,
    hits,
    misses,
    overallAccuracy: attempts > 0 ? (hits / attempts) * 100 : 0,
    overallAvgReaction: reactionWeight > 0 ? reactionTotal / reactionWeight : null
  };
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sexLabel(value) {
  return value === "female" ? "Feminino" : "Masculino";
}

function roleLabel(value) {
  if (value === "god") return "Deus";
  return value === "admin" ? "ADM" : "Padrão";
}

function userRoleLabel(user = {}) {
  if (user.role === "admin") return `ADM rank ${user.adminRank === 1 ? "1" : "2"}`;
  return roleLabel(user.role);
}

function hierarchyLevel(user = {}) {
  if (user.role === "god") return 3;
  if (user.role === "admin") return user.adminRank === 1 ? 2 : 1;
  return 0;
}

function canManageUser(user = {}) {
  return isAdmin() && hierarchyLevel(window.authState.user) > hierarchyLevel(user);
}

function roleChangeOptions(user = {}) {
  const actor = window.authState.user || {};
  const actorLevel = hierarchyLevel(actor);
  const options = [{ label: userRoleLabel(user), role: user.role, adminRank: user.adminRank || 2, current: true }];

  if (actorLevel > 0) options.push({ label: "Usuário", role: "user", adminRank: 2 });
  if (actorLevel >= 1) options.push({ label: "ADM rank 2", role: "admin", adminRank: 2 });
  if (actor.role === "god") {
    options.push({ label: "ADM rank 1", role: "admin", adminRank: 1 });
    options.push({ label: "Deus", role: "god", adminRank: 2 });
  }

  return options.filter((option, index, all) => {
    const optionKey = `${option.role}:${option.adminRank}`;
    return all.findIndex((item) => `${item.role}:${item.adminRank}` === optionKey) === index;
  });
}

function inviteUrl(token) {
  return `${window.location.origin}/?invite=${encodeURIComponent(token)}`;
}

function renderUsers(users = []) {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8">Nenhum usuário cadastrado.</td></tr>';
    return;
  }

  tbody.innerHTML = users.map((user) => `
    <tr>
      <td>${user.displayName || "--"}</td>
      <td>${user.email || user.username || "--"}</td>
      <td>${user.age || "--"}</td>
      <td>${sexLabel(user.sex || user.gender)}</td>
      <td><span class="admin-pill ${user.role === "god" ? "god" : (user.role === "admin" ? "admin" : "")}">${userRoleLabel(user)}</span></td>
      <td>${user.historyCount || 0}</td>
      <td>${formatDate(user.createdAt)}</td>
      <td>
        ${renderUserActions(user)}
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-history-user]").forEach((button) => {
    button.addEventListener("click", () => loadUserPerformance(button.dataset.historyUser, button.dataset.historyName));
  });
  tbody.querySelectorAll("[data-ban-user]").forEach((button) => {
    button.addEventListener("click", () => banUser(button.dataset.banUser, button.dataset.banName));
  });
  tbody.querySelectorAll("[data-role-select]").forEach((select) => {
    select.addEventListener("change", () => {
      const selected = select.selectedOptions[0];
      changeUserRole(select.dataset.roleSelect, selected.dataset.role, Number(selected.dataset.adminRank), select.dataset.userName, select);
    });
  });
}

function renderUserActions(user = {}) {
  const userName = user.displayName || user.email || user.username || "este usuário";
  const safeUserName = escapeHtml(userName);
  const options = roleChangeOptions(user)
    .map((option) => `<option value="${option.role}:${option.adminRank}" data-role="${option.role}" data-admin-rank="${option.adminRank}" ${option.current ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("");
  const performanceButton = `<button class="landing-mini-button" type="button" data-history-user="${escapeHtml(user.id)}" data-history-name="${safeUserName}">Desempenho</button>`;
  if (!canManageUser(user)) {
    return `<div class="admin-row-actions">${performanceButton}</div>`;
  }
  const canBan = isGod() || (window.authState.user && window.authState.user.role === "admin" && window.authState.user.adminRank === 1);
  const ban = canBan
    ? `<button class="landing-mini-button danger-button" type="button" data-ban-user="${escapeHtml(user.id)}" data-ban-name="${safeUserName}">Banir</button>`
    : "";

  return `
    <div class="admin-row-actions">
      ${performanceButton}
      <select class="admin-role-select" data-role-select="${escapeHtml(user.id)}" data-user-name="${safeUserName}">
        ${options}
      </select>
      ${ban}
    </div>
  `;
}

function renderInvites(invites = []) {
  const list = document.getElementById("invitesList");
  if (!list) return;

  if (!invites.length) {
    list.innerHTML = '<div class="admin-empty">Nenhum convite gerado.</div>';
    return;
  }

  list.innerHTML = invites.map((invite) => {
    const url = inviteUrl(invite.token);
    return `
      <article class="admin-invite-item">
        <div>
          <strong>${roleLabel(invite.type === "god" ? "god" : (invite.type === "admin" ? "admin" : "user"))}</strong>
          <span>Expira em ${formatDate(invite.expiresAt)}</span>
        </div>
        <input type="text" value="${url}" readonly />
        <button class="landing-mini-button" type="button" data-copy="${url}">Copiar</button>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await copyText(button.dataset.copy);
    });
  });
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setAdminMessage("Link copiado.", "success");
    return true;
  } catch (error) {
    setAdminMessage("Não foi possível copiar automaticamente. Selecione o link e copie manualmente.", "error");
    return false;
  }
}

function updateAdminPanelsVisibility() {
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.hidden = !isAdmin();
  });
  document.querySelectorAll(".god-only").forEach((element) => {
    element.hidden = !isGod();
  });
}

async function fetchAdminJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: getAuthHeaders({
      "Content-Type": "application/json",
      ...(options.headers || {})
    }),
    cache: "no-store"
  });
  const parsed = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(parsed.error || "Acesso administrativo indisponível.");
  }
  return parsed;
}

async function loadAdminData() {
  updateAdminPanelsVisibility();
  if (!isLoggedIn()) return;
  if (!isAdmin()) {
    setAdminMessage("Esta pagina e exclusiva para administradores.", "error");
    return;
  }
  if (adminState.loading) return;
  adminState.loading = true;

  try {
    const [usersPayload, invitesPayload] = await Promise.all([
      fetchAdminJson("/api/admin/users"),
      fetchAdminJson("/api/admin/invites")
    ]);
    renderUsers(usersPayload.users || []);
    renderInvites(invitesPayload.invites || []);
    updateAdminPanelsVisibility();
    setAdminMessage("Dados administrativos carregados.", "success");
  } catch (error) {
    setAdminMessage(error.message, "error");
  } finally {
    adminState.loading = false;
  }
}

async function createInvite(type) {
  if (!isAdmin()) {
    setAdminMessage("Somente ADMs podem gerar convites.", "error");
    return;
  }

  try {
    const payload = await fetchAdminJson("/api/admin/invites", {
      method: "POST",
      body: JSON.stringify({ type })
    });
    const url = inviteUrl(payload.invite.token);
    const latest = document.getElementById("latestInvite");
    if (latest) {
      latest.innerHTML = `<strong>${roleLabel(type === "god" ? "god" : (type === "admin" ? "admin" : "user"))}</strong><input type="text" value="${url}" readonly />`;
    }
    const copied = await copyText(url);
    if (copied) {
      setAdminMessage("Convite gerado e link copiado.", "success");
    }
    await loadAdminData();
  } catch (error) {
    setAdminMessage(error.message, "error");
  }
}

function renderUserPerformance(payload = {}) {
  const panel = document.getElementById("adminPerformancePanel");
  const title = document.getElementById("adminPerformanceTitle");
  const summary = document.getElementById("adminPerformanceSummary");
  const list = document.getElementById("adminPerformanceList");
  if (!panel || !title || !summary || !list) return;

  const user = payload.user || {};
  const history = Array.isArray(payload.history) ? payload.history : [];
  const insights = payload.insights || {};
  const calculatedTotals = calculatePerformanceTotals(history);
  const serverTotals = insights.totals || {};
  const totals = Number(serverTotals.attempts) > 0 ? serverTotals : calculatedTotals;

  adminState.openPerformanceUserId = user.id || payload.selectedUserId || null;
  panel.hidden = false;
  title.textContent = user.displayName || user.email || user.username || payload.selectedName || "Usuário";
  summary.innerHTML = `
    <div class="admin-performance-stat"><span>Sessões</span><strong>${history.length}</strong></div>
    <div class="admin-performance-stat"><span>Ações</span><strong>${totals.attempts || 0}</strong></div>
    <div class="admin-performance-stat"><span>Precisão</span><strong>${formatPercent(totals.overallAccuracy)}</strong></div>
    <div class="admin-performance-stat"><span>Reação média</span><strong>${formatSeconds(totals.overallAvgReaction)}</strong></div>
  `;

  if (!history.length) {
    list.innerHTML = '<div class="admin-empty">Este usuário ainda não tem histórico de partidas.</div>';
    return;
  }

  list.innerHTML = history.map((item) => {
    const modeLabel = item.customMode ? `Modo custom (${item.difficultyPhase || item.phase})` : `Fase ${item.phase}`;
    const livesLabel = item.livesLeft === "INF" || item.livesLeft === Infinity ? "INF" : item.livesLeft;
    const goalLabel = item.enemyHitsNeeded === "INF" || item.enemyHitsNeeded === Infinity ? "INF" : item.enemyHitsNeeded;
    const breakdown = Object.entries(item.actionBreakdown || {})
      .map(([action, stats]) => `
        <li>${escapeHtml(actionLabel(action))}: ${stats.attempts || 0} ações | ${stats.hits || 0} acertos | ${formatPercent(stats.accuracy)}</li>
      `)
      .join("");

    return `
      <article class="admin-performance-item">
        <h4>${escapeHtml(modeLabel)} - ${escapeHtml(item.status || "sessão")}</h4>
        <p>${formatDate(item.createdAt)} | duração ${formatSeconds(item.duration)} | reação ${formatSeconds(item.avgReaction)}</p>
        <p>Acertos ${item.hits || 0} | Erros ${item.misses || 0} | Precisão ${formatPercent(item.accuracy)} | Ataques ${item.enemyHits || 0}/${goalLabel} | Vidas ${livesLabel}</p>
        <ul class="admin-performance-breakdown">${breakdown}</ul>
      </article>
    `;
  }).join("");
}

async function loadUserPerformance(userId, userName) {
  const panel = document.getElementById("adminPerformancePanel");
  if (panel && !panel.hidden && String(adminState.openPerformanceUserId) === String(userId)) {
    panel.hidden = true;
    adminState.openPerformanceUserId = null;
    setAdminMessage("Desempenho fechado.", "info");
    return;
  }

  try {
    setAdminMessage(`Carregando desempenho de ${userName || "usuário"}...`, "info");
    const payload = await fetchAdminJson(`/api/admin/users/${encodeURIComponent(userId)}/history`);
    payload.selectedName = userName;
    payload.selectedUserId = userId;
    renderUserPerformance(payload);
    setAdminMessage("Desempenho carregado.", "success");
  } catch (error) {
    setAdminMessage(error.message, "error");
  }
}

async function changeUserRole(userId, role, adminRank, userName, selectEl) {
  const targetLabel = role === "admin" ? `ADM rank ${adminRank === 1 ? "1" : "2"}` : roleLabel(role);
  const confirmed = window.confirm(`Alterar ${userName || "este usuário"} para ${targetLabel}?`);
  if (!confirmed) {
    if (selectEl) selectEl.value = selectEl.querySelector("option[selected]")?.value || selectEl.options[0]?.value || "";
    return;
  }

  const confirmationName = role === "god"
    ? window.prompt(`Para promover ${userName || "este usuário"} para Deus, digite exatamente: ${userName}`)
    : "";
  if (role === "god" && confirmationName !== userName) {
    if (selectEl) selectEl.value = selectEl.querySelector("option[selected]")?.value || selectEl.options[0]?.value || "";
    setAdminMessage("Promoção para Deus cancelada: o nome digitado não confere.", "error");
    return;
  }

  try {
    await fetchAdminJson(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role, adminRank, confirmationName })
    });
    setAdminMessage("Conta atualizada.", "success");
    await loadAdminData();
  } catch (error) {
    setAdminMessage(error.message, "error");
  }
}

async function banUser(userId, userName) {
  const actor = window.authState.user || {};
  if (!isGod() && !(actor.role === "admin" && actor.adminRank === 1)) {
    setAdminMessage("Somente contas Deus e ADMs rank 1 podem banir.", "error");
    return;
  }

  const confirmed = window.confirm(`Banir ${userName || "este usuário"}? A conta será apagada do banco de dados.`);
  if (!confirmed) return;

  try {
    await fetchAdminJson(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    setAdminMessage("Conta banida e removida do banco.", "success");
    await loadAdminData();
  } catch (error) {
    setAdminMessage(error.message, "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  updateAdminPanelsVisibility();
  document.getElementById("createStandardInvite")?.addEventListener("click", () => createInvite("standard"));
  document.getElementById("createAdminInvite")?.addEventListener("click", () => createInvite("admin"));
  document.getElementById("createGodInvite")?.addEventListener("click", () => createInvite("god"));
  document.getElementById("refreshAdminButton")?.addEventListener("click", loadAdminData);
});

window.addEventListener("auth-state-change", () => {
  void loadAdminData();
});

