const adminState = {
  loading: false
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

function sexLabel(value) {
  return value === "female" ? "Feminino" : "Masculino";
}

function roleLabel(value) {
  if (value === "god") return "Deus";
  return value === "admin" ? "ADM" : "Padrão";
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
      <td><span class="admin-pill ${user.role === "god" ? "god" : (user.role === "admin" ? "admin" : "")}">${roleLabel(user.role)}</span></td>
      <td>${user.historyCount || 0}</td>
      <td>${formatDate(user.createdAt)}</td>
      <td class="god-only">
        ${isGod() && user.role !== "god" ? `<button class="landing-mini-button danger-button" type="button" data-ban-user="${user.id}" data-ban-name="${user.displayName || user.email || user.username}">Banir</button>` : ""}
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-ban-user]").forEach((button) => {
    button.addEventListener("click", () => banUser(button.dataset.banUser, button.dataset.banName));
  });
}

function renderInvites(invites = []) {
  const list = document.getElementById("invitesList");
  if (!list) return;

  if (!invites.length) {
    list.innerHTML = '<div class="admin-empty">Nenhum convite gerado.</div>';
    return;
  }

  list.innerHTML = invites.map((invite) => {
    const used = Boolean(invite.usedAt);
    const url = inviteUrl(invite.token);
    return `
      <article class="admin-invite-item">
        <div>
          <strong>${roleLabel(invite.type === "god" ? "god" : (invite.type === "admin" ? "admin" : "user"))}</strong>
          <span>${used ? `Usado em ${formatDate(invite.usedAt)}` : "Disponível"}</span>
        </div>
        <input type="text" value="${url}" readonly />
        <button class="landing-mini-button" type="button" data-copy="${url}">Copiar</button>
      </article>
    `;
  }).join("");

  list.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      setAdminMessage("Link copiado.", "success");
    });
  });
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
    await navigator.clipboard.writeText(url).catch(() => {});
    setAdminMessage("Convite gerado. Link copiado quando permitido pelo navegador.", "success");
    await loadAdminData();
  } catch (error) {
    setAdminMessage(error.message, "error");
  }
}

async function banUser(userId, userName) {
  if (!isGod()) {
    setAdminMessage("Somente contas Deus podem banir usuários.", "error");
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
